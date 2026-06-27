import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    const clientID =
      configService.get<string>('GOOGLE_CLIENT_ID')?.trim() ||
      process.env.GOOGLE_CLIENT_ID?.trim() ||
      'missing-client-id';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET')?.trim() ||
      process.env.GOOGLE_CLIENT_SECRET?.trim() ||
      'missing-client-secret';
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL')?.trim() ||
      process.env.GOOGLE_CALLBACK_URL?.trim() ||
      'http://localhost:3000/api/auth/google/callback';

    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
  ) {
    return {
      googleId: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName || profile.name?.givenName || 'Google User',
      avatarUrl: profile.photos?.[0]?.value || null,
    };
  }
}
