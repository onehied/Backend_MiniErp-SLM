import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ForgotPasswordDto,
  GoogleAuthDto,
  LoginDto,
  RegisterDto,
  LoginResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
  ResetPasswordDto,
  UploadProfileImageResponseDto,
  UpdateProfileDto,
  UserDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createUploadStorage } from '../common/utils/upload.util';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private activityLogsService: ActivityLogsService,
  ) {}

  @Post('register')
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Email already registered' })
  async register(@Req() req: any, @Body() dto: RegisterDto): Promise<LoginResponseDto> {
    return this.authService.register(dto, this.activityLogsService.getRequestContext(req));
  }

  @Post('login')
  @Throttle({
    default: {
      limit: 10,
      ttl: 60_000,
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Req() req: any, @Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto, this.activityLogsService.getRequestContext(req));
  }

  @Post('refresh')
  @ApiResponse({
    status: 200,
    description: 'Access token refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(
    @Req() req: any,
    @Body() dto: RefreshTokenDto,
  ): Promise<RefreshTokenResponseDto> {
    return this.authService.refreshToken(
      dto.refresh_token,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post('google/login')
  @ApiResponse({
    status: 200,
    description: 'Google login success',
    type: LoginResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Google account not linked' })
  async loginWithGoogle(@Req() req: any, @Body() dto: GoogleAuthDto): Promise<LoginResponseDto> {
    return this.authService.loginWithGoogle(
      dto.idToken,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    return;
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const redirectUrl = await this.authService.buildGoogleLoginRedirect(req.user);
    return res.redirect(redirectUrl);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    type: UserDto,
  })
  async me(@Req() req: any): Promise<UserDto> {
    return req.user;
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({ status: 200, description: 'Profile updated', type: UserDto })
  async updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserDto> {
    return this.authService.updateProfile(
      req.user.id,
      dto,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post('google/link')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Google account linked',
    type: UserDto,
  })
  async linkGoogle(
    @Req() req: any,
    @Body() dto: GoogleAuthDto,
  ): Promise<UserDto> {
    return this.authService.linkGoogle(
      req.user.id,
      dto.idToken,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post('google/unlink')
  @UseGuards(JwtAuthGuard)
  @ApiResponse({
    status: 200,
    description: 'Google account unlinked',
    type: UserDto,
  })
  async unlinkGoogle(@Req() req: any): Promise<UserDto> {
    return this.authService.unlinkGoogle(
      req.user.id,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post('forgot-password')
  @Throttle({
    default: {
      limit: 5,
      ttl: 60_000,
    },
  })
  @ApiResponse({ status: 200, description: 'Reset link sent successfully' })
  @ApiResponse({ status: 404, description: 'Email not found' })
  async forgotPassword(@Req() req: any, @Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(
      dto.email,
      this.activityLogsService.getRequestContext(req),
    );
  }

  @Post('reset-password')
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  async resetPassword(@Req() req: any, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(
      dto.token,
      dto.newPassword,
      this.activityLogsService.getRequestContext(req),
    );
  }
}

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(
    private authService: AuthService,
    private activityLogsService: ActivityLogsService,
  ) {}

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: createUploadStorage('avatars'),
      limits: {
        fileSize: 2 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        if (
          ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
        ) {
          callback(null, true);
          return;
        }

        callback(
          new BadRequestException(
            'Format file harus JPG, PNG, atau WEBP.',
          ) as any,
          false,
        );
      },
    }),
  )
  @ApiResponse({
    status: 200,
    description: 'Profile image uploaded successfully',
    type: UploadProfileImageResponseDto,
  })
  async uploadImage(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadProfileImageResponseDto> {
    if (!file) {
      throw new BadRequestException('File gambar wajib dipilih.');
    }

    return this.authService.uploadProfileImage(
      req.user.id,
      file,
      this.activityLogsService.getRequestContext(req),
    );
  }
}
