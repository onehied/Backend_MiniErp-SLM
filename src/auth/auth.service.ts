import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { MailerService } from '@nestjs-modules/mailer';
import { randomUUID } from 'crypto';
import {
  buildUploadUrl,
  resolveUploadPath,
  safeDeleteFile,
} from '../common/utils/upload.util';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { ActivityLogContext } from '../activity-logs/activity-logs.types';

interface GoogleOAuthUser {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

interface GoogleLinkStatePayload {
  sub: string;
  purpose: 'LINK_GOOGLE';
}

@Injectable()
export class AuthService {
  //set password default login google oauth
  private static readonly GOOGLE_DEFAULT_PASSWORD = 'password123';
  private readonly googleClient: OAuth2Client;
  private readonly userInclude = {
    userRoles: {
      include: {
        role: true,
      },
    },
  } as const;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailerService: MailerService,
    private activityLogsService: ActivityLogsService,
  ) {
    this.googleClient = new OAuth2Client();
  }

  private getGoogleOAuthClient() {
    const clientId =
      this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      '';
    const clientSecret =
      this.configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      '';
    const callbackUrl =
      this.configService.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      process.env.GOOGLE_CALLBACK_URL?.trim() ||
      '';

    if (!clientId || !clientSecret || !callbackUrl) {
      throw new BadRequestException(
        'Konfigurasi Google OAuth belum lengkap di backend.',
      );
    }

    return new OAuth2Client(clientId, clientSecret, callbackUrl);
  }

  private async logAuthActivity(input: {
    action: string;
    status: 'SUCCESS' | 'FAILED';
    message: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    context?: ActivityLogContext | null;
  }) {
    await this.activityLogsService.log({
      action: input.action,
      module: 'AUTH',
      status: input.status,
      message: input.message,
      entityType: 'USER',
      entityId: input.entityId || input.context?.actorUserId || null,
      metadata: input.metadata || null,
      context: input.context,
    });
  }

  private getBackendBaseUrl() {
    return this.configService.get<string>('APP_URL') || 'http://localhost:3000';
  }

  private getFrontendBaseUrl() {
    return (
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001'
    );
  }

  private async ensureDefaultRole() {
    return this.prisma.role.upsert({
      where: { roleName: 'USER' },
      update: {},
      create: {
        roleName: 'USER',
        description: 'Default user role',
      },
    });
  }

  private buildUserPayload(user: any) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      roles: user.userRoles.map((entry: any) => entry.role.roleName),
      googleLinked: Boolean(user.googleId),
      googleEmail: user.googleEmail,
      googleName: user.googleName,
      googleAvatarUrl: user.googleAvatarUrl,
    };
  }

  private buildJwtPayload(user: any) {
    return {
      sub: user.id,
      email: user.email,
    };
  }

  private async buildAccessToken(user: any) {
    return this.jwtService.signAsync(this.buildJwtPayload(user));
  }

  private async buildRefreshToken(user: any) {
    return this.jwtService.signAsync(this.buildJwtPayload(user), {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpiresIn'),
    });
  }

  private parseDurationToMs(value: string | number | undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value !== 'string') {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const normalized = value.trim();
    const match = normalized.match(/^(\d+)(ms|s|m|h|d)?$/i);

    if (!match) {
      return 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = (match[2] || 'ms').toLowerCase();

    switch (unit) {
      case 'd':
        return amount * 24 * 60 * 60 * 1000;
      case 'h':
        return amount * 60 * 60 * 1000;
      case 'm':
        return amount * 60 * 1000;
      case 's':
        return amount * 1000;
      case 'ms':
      default:
        return amount;
    }
  }

  private getRefreshTokenExpiresAt() {
    const refreshTtl = this.configService.get<string>('jwt.refreshExpiresIn');
    return new Date(Date.now() + this.parseDurationToMs(refreshTtl));
  }

  private async persistRefreshToken(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        expiresAt: this.getRefreshTokenExpiresAt(),
      },
    });
  }

  private async issueAuthTokens(user: any) {
    const access_token = await this.buildAccessToken(user);
    const refresh_token = await this.buildRefreshToken(user);

    await this.persistRefreshToken(user.id, refresh_token);

    return {
      access_token,
      refresh_token,
      user: this.buildUserPayload(user),
    };
  }

  private buildGoogleCallbackRedirectUrl(params: Record<string, string>) {
    const frontendUrl = this.getFrontendBaseUrl().replace(/\/$/, '');
    const searchParams = new URLSearchParams(params);
    return `${frontendUrl}/auth/callback?${searchParams.toString()}`;
  }

  private async buildGoogleLinkState(userId: string) {
    return this.jwtService.signAsync(
      {
        sub: userId,
        purpose: 'LINK_GOOGLE',
      } satisfies GoogleLinkStatePayload,
      {
        expiresIn: '10m',
      },
    );
  }

  private async verifyGoogleLinkState(state: string) {
    try {
      const payload = await this.jwtService.verifyAsync<GoogleLinkStatePayload>(
        state,
      );

      if (payload.purpose !== 'LINK_GOOGLE' || !payload.sub) {
        throw new UnauthorizedException('State Google link tidak valid.');
      }

      return payload.sub;
    } catch {
      throw new UnauthorizedException('State Google link tidak valid.');
    }
  }

  private async verifyGoogleIdToken(idToken: string): Promise<TokenPayload> {
    const clientId = this.getGoogleClientId();

    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured');
    }

    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) {
      throw new UnauthorizedException('Google token is invalid');
    }

    return payload;
  }

  getGoogleClientId() {
    return (
      this.configService.get<string>('GOOGLE_CLIENT_ID')?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      ''
    );
  }

  getGoogleClientConfig() {
    const clientId = this.getGoogleClientId();

    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID belum dikonfigurasi.');
    }

    return { clientId };
  }

  async getGoogleLinkAuthorizationUrl(userId: string) {
    const googleClient = this.getGoogleOAuthClient();
    const state = await this.buildGoogleLinkState(userId);

    return {
      authorizationUrl: googleClient.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['openid', 'email', 'profile'],
        state,
      }),
    };
  }

  async register(data: RegisterDto, context?: ActivityLogContext | null) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUser) {
      await this.logAuthActivity({
        action: 'REGISTER',
        status: 'FAILED',
        message: 'Registrasi gagal karena email sudah terdaftar.',
        metadata: { email: data.email },
        context,
      });
      throw new BadRequestException('Email already registered');
    }

    if (existingUsername) {
      await this.logAuthActivity({
        action: 'REGISTER',
        status: 'FAILED',
        message: 'Registrasi gagal karena username sudah dipakai.',
        metadata: { username: data.username, email: data.email },
        context,
      });
      throw new BadRequestException('Username already taken');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const defaultRole = await this.ensureDefaultRole();

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        name: data.name,
        passwordHash: hashedPassword,
        userRoles: {
          create: {
            roleId: defaultRole.id,
          },
        },
      },
      include: this.userInclude,
    });

    const tokens = await this.issueAuthTokens(user);
    await this.logAuthActivity({
      action: 'REGISTER',
      status: 'SUCCESS',
      message: 'User berhasil registrasi.',
      entityId: user.id,
      metadata: {
        email: user.email,
        username: user.username,
        roles: user.userRoles.map((entry: any) => entry.role.roleName),
      },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return tokens;
  }

  async login(data: LoginDto, context?: ActivityLogContext | null) {
    const user = await this.prisma.user.findUnique({
      where: { email: data.email },
      include: this.userInclude,
    });

    if (!user) {
      await this.logAuthActivity({
        action: 'LOGIN',
        status: 'FAILED',
        message: 'Login gagal karena email tidak terdaftar.',
        metadata: { email: data.email },
        context,
      });
      throw new UnauthorizedException('Email tidak terdaftar.');
    }

    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.logAuthActivity({
        action: 'LOGIN',
        status: 'FAILED',
        message: 'Login gagal karena password salah.',
        entityId: user.id,
        metadata: { email: user.email },
        context: {
          ...context,
          actorUserId: user.id,
          actorEmail: user.email,
          actorName: user.name,
        },
      });
      throw new UnauthorizedException('Password salah.');
    }

    const tokens = await this.issueAuthTokens(user);
    await this.logAuthActivity({
      action: 'LOGIN',
      status: 'SUCCESS',
      message: 'User berhasil login.',
      entityId: user.id,
      metadata: { email: user.email, roles: user.userRoles.map((entry: any) => entry.role.roleName) },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return tokens;
  }

  async loginWithGoogle(idToken: string, context?: ActivityLogContext | null) {
    const payload = await this.verifyGoogleIdToken(idToken);

    const linkedUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: payload.sub }, { email: payload.email }],
      },
      include: this.userInclude,
    });

    if (!linkedUser) {
      await this.logAuthActivity({
        action: 'LOGIN_GOOGLE',
        status: 'FAILED',
        message: 'Login Google gagal karena akun belum ditautkan.',
        metadata: { email: payload.email },
        context,
      });
      throw new UnauthorizedException('Akun belum ditambahkan.');
    }

    const updated = await this.prisma.user.update({
      where: { id: linkedUser.id },
      data: {
        googleId: payload.sub,
        googleEmail: payload.email,
        googleName: payload.name,
        googleAvatarUrl: payload.picture,
        googleLinkedAt: new Date(),
      },
      include: this.userInclude,
    });

    const tokens = await this.issueAuthTokens(updated);
    await this.logAuthActivity({
      action: 'LOGIN_GOOGLE',
      status: 'SUCCESS',
      message: 'User berhasil login dengan Google.',
      entityId: updated.id,
      metadata: { email: updated.email, googleId: payload.sub },
      context: {
        ...context,
        actorUserId: updated.id,
        actorEmail: updated.email,
        actorName: updated.name,
      },
    });
    return tokens;
  }

  async linkGoogle(userId: string, idToken: string, context?: ActivityLogContext | null) {
    const payload = await this.verifyGoogleIdToken(idToken);

    return this.linkGoogleAccount(
      userId,
      {
        googleId: payload.sub,
        email: payload.email || '',
        name: payload.name || payload.email || 'Google User',
        avatarUrl: payload.picture || null,
      },
      context,
    );
  }

  private async linkGoogleAccount(
    userId: string,
    googleUser: GoogleOAuthUser,
    context?: ActivityLogContext | null,
  ) {
    const existingLink = await this.prisma.user.findFirst({
      where: {
        googleId: googleUser.googleId,
        id: { not: userId },
      },
    });

    if (existingLink) {
      throw new BadRequestException(
        'Akun Google sudah ditautkan ke user lain.',
      );
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: googleUser.googleId,
        googleEmail: googleUser.email,
        googleName: googleUser.name,
        googleAvatarUrl: googleUser.avatarUrl,
        googleLinkedAt: new Date(),
      },
      include: this.userInclude,
    });

    await this.logAuthActivity({
      action: 'LINK_GOOGLE',
      status: 'SUCCESS',
      message: 'Akun Google berhasil ditautkan.',
      entityId: user.id,
      metadata: { email: user.email, googleId: googleUser.googleId },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return this.buildUserPayload(user);
  }

  async completeGoogleLink(
    state: string,
    googleUser: GoogleOAuthUser,
    context?: ActivityLogContext | null,
  ) {
    try {
      const userId = await this.verifyGoogleLinkState(state);
      const linkedUser = await this.linkGoogleAccount(userId, googleUser, context);

      return this.buildGoogleCallbackRedirectUrl({
        mode: 'link_google',
        status: 'success',
        message: 'Akun Google berhasil ditautkan.',
        google_name: linkedUser.googleName || '',
        google_email: linkedUser.googleEmail || '',
        google_avatar_url: linkedUser.googleAvatarUrl || '',
      });
    } catch (error: any) {
      return this.buildGoogleCallbackRedirectUrl({
        mode: 'link_google',
        status: 'error',
        message: error?.message || 'Tidak dapat menautkan akun Google.',
      });
    }
  }

  async unlinkGoogle(userId: string, context?: ActivityLogContext | null) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleId: null,
        googleEmail: null,
        googleName: null,
        googleAvatarUrl: null,
        googleLinkedAt: null,
      },
      include: this.userInclude,
    });

    await this.logAuthActivity({
      action: 'UNLINK_GOOGLE',
      status: 'SUCCESS',
      message: 'Tautan akun Google berhasil dilepas.',
      entityId: user.id,
      metadata: { email: user.email },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return this.buildUserPayload(user);
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
    context?: ActivityLogContext | null,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (data.username && data.username.trim() !== user.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: data.username.trim() },
      });

      if (existing) {
        throw new BadRequestException('Username already taken');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username?.trim() ?? user.username,
        name: data.name?.trim() ?? user.name,
        phone: data.phone?.trim() || null,
        avatarUrl: data.avatarUrl?.trim() || null,
      },
      include: this.userInclude,
    });

    await this.logAuthActivity({
      action: 'UPDATE_PROFILE',
      status: 'SUCCESS',
      message: 'Profil user berhasil diperbarui.',
      entityId: updated.id,
      metadata: {
        oldValue: {
          username: user.username,
          name: user.name,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
        },
        newValue: {
          username: updated.username,
          name: updated.name,
          phone: updated.phone,
          avatarUrl: updated.avatarUrl,
        },
      },
      context: {
        ...context,
        actorUserId: updated.id,
        actorEmail: updated.email,
        actorName: updated.name,
      },
    });
    return this.buildUserPayload(updated);
  }

  async validateUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: this.userInclude,
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      ...this.buildUserPayload(user),
      status: user.status,
    };
  }

  async refreshToken(
    refreshToken: string,
    context?: ActivityLogContext | null,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    try {
      await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: this.userInclude,
        },
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token tidak valid.');
    }

    if (storedToken.expiresAt.getTime() <= Date.now()) {
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      throw new UnauthorizedException('Refresh token sudah kedaluwarsa.');
    }

    const access_token = await this.buildAccessToken(storedToken.user);

    await this.logAuthActivity({
      action: 'REFRESH_TOKEN',
      status: 'SUCCESS',
      message: 'Access token berhasil diperbarui.',
      entityId: storedToken.user.id,
      metadata: { email: storedToken.user.email },
      context: {
        ...context,
        actorUserId: storedToken.user.id,
        actorEmail: storedToken.user.email,
        actorName: storedToken.user.name,
      },
    });
    return { access_token };
  }

  async loginOrRegisterGoogleUser(googleUser: GoogleOAuthUser) {
    const defaultRole = await this.ensureDefaultRole();

    const existingByGoogle = await this.prisma.user.findFirst({
      where: { googleId: googleUser.googleId },
      include: this.userInclude,
    });

    if (existingByGoogle) {
      const updated = await this.prisma.user.update({
        where: { id: existingByGoogle.id },
        data: {
          email: googleUser.email,
          name: googleUser.name,
          googleEmail: googleUser.email,
          googleName: googleUser.name,
          googleAvatarUrl: googleUser.avatarUrl,
          googleLinkedAt: new Date(),
          avatarUrl: existingByGoogle.avatarUrl || googleUser.avatarUrl || null,
        },
        include: this.userInclude,
      });

      return this.issueAuthTokens(updated);
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
      include: this.userInclude,
    });

    if (existingByEmail) {
      const updated = await this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: googleUser.googleId,
          googleEmail: googleUser.email,
          googleName: googleUser.name,
          googleAvatarUrl: googleUser.avatarUrl,
          googleLinkedAt: new Date(),
          avatarUrl: existingByEmail.avatarUrl || googleUser.avatarUrl || null,
        },
        include: this.userInclude,
      });

      return this.issueAuthTokens(updated);
    }

    const usernameBase = googleUser.email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '');
    let username = usernameBase || `user${Date.now()}`;
    let counter = 1;

    while (
      await this.prisma.user.findUnique({
        where: { username },
      })
    ) {
      username = `${usernameBase || 'user'}${counter}`;
      counter += 1;
    }

    const defaultGooglePasswordHash = await bcrypt.hash(
      AuthService.GOOGLE_DEFAULT_PASSWORD,
      10,
    );

    const created = await this.prisma.user.create({
      data: {
        username,
        email: googleUser.email,
        name: googleUser.name,
        passwordHash: defaultGooglePasswordHash,
        avatarUrl: googleUser.avatarUrl || null,
        googleId: googleUser.googleId,
        googleEmail: googleUser.email,
        googleName: googleUser.name,
        googleAvatarUrl: googleUser.avatarUrl || null,
        googleLinkedAt: new Date(),
        userRoles: {
          create: {
            roleId: defaultRole.id,
          },
        },
      },
      include: this.userInclude,
    });

    return this.issueAuthTokens(created);
  }

  async buildGoogleLoginRedirect(googleUser: GoogleOAuthUser) {
    const authResult = await this.loginOrRegisterGoogleUser(googleUser);

    return this.buildGoogleCallbackRedirectUrl({
      access_token: authResult.access_token,
      refresh_token: authResult.refresh_token,
    });
  }

  async forgotPassword(email: string, context?: ActivityLogContext | null) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.logAuthActivity({
        action: 'FORGOT_PASSWORD',
        status: 'FAILED',
        message: 'Permintaan lupa password gagal karena email tidak ditemukan.',
        metadata: { email },
        context,
      });
      throw new NotFoundException('Email tidak ditemukan.');
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const resetUrl = `${this.getFrontendBaseUrl().replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    await this.mailerService.sendMail({
      to: user.email,
      from:
        this.configService.get<string>('MAIL_FROM') ||
        'Mini ERP <noreply@minierp.com>',
      subject: 'Reset Password Mini ERP',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Reset Password</h2>
          <p>Halo ${user.name},</p>
          <p>Klik tombol di bawah ini untuk mengatur ulang password akun Anda.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#0f4c81;color:#fff;text-decoration:none;border-radius:6px;">
              Reset Password
            </a>
          </p>
          <p>Link ini berlaku selama 1 jam.</p>
        </div>
      `,
    });

    await this.logAuthActivity({
      action: 'FORGOT_PASSWORD',
      status: 'SUCCESS',
      message: 'Link reset password berhasil dikirim.',
      entityId: user.id,
      metadata: { email: user.email },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return {
      message: 'Link reset password telah dikirim ke email Anda.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
    context?: ActivityLogContext | null,
  ) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: {
        user: true,
      },
    });

    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Token reset password tidak valid atau sudah kedaluwarsa.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.delete({
        where: { id: resetToken.id },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId: resetToken.userId },
      }),
    ]);

    await this.logAuthActivity({
      action: 'RESET_PASSWORD',
      status: 'SUCCESS',
      message: 'Password user berhasil direset.',
      entityId: resetToken.userId,
      metadata: { email: resetToken.user.email },
      context: {
        ...context,
        actorUserId: resetToken.userId,
        actorEmail: resetToken.user.email,
        actorName: resetToken.user.name,
      },
    });
    return {
      message: 'Password berhasil diubah.',
    };
  }

  async uploadProfileImage(
    userId: string,
    file: Express.Multer.File,
    context?: ActivityLogContext | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const avatarUrl = buildUploadUrl(
      this.getBackendBaseUrl(),
      'avatars',
      file.filename,
    );

    if (user.avatarUrl?.includes('/uploads/avatars/')) {
      safeDeleteFile(resolveUploadPath(user.avatarUrl));
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl,
      },
    });

    await this.logAuthActivity({
      action: 'UPLOAD_AVATAR',
      status: 'SUCCESS',
      message: 'Foto profil berhasil diunggah.',
      entityId: user.id,
      metadata: {
        oldValue: { avatarUrl: user.avatarUrl },
        newValue: { avatarUrl },
        fileName: file.originalname,
      },
      context: {
        ...context,
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: user.name,
      },
    });
    return { avatarUrl };
  }
}
