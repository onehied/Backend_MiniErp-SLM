import {
  IsEmail,
  IsString,
  MinLength,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class GoogleAuthDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...abc',
    description: 'Google ID token from Google Identity Services',
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Refresh token',
  })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@email.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @MinLength(6)
  newPassword: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  username: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  name: string;

  @ApiProperty({ example: 'secret123' })
  @IsString()
  @MinLength(6)
  password: string;
}

export class UserDto {
  @ApiProperty({ example: 'cl1a2b3c4d5e6f7g8h9i0j' })
  id: string;

  @ApiProperty({ example: 'user@example.com' })
  email: string;

  @ApiProperty({ example: 'admin' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({
    example: 'https://cdn.example.com/avatar.png',
    required: false,
  })
  avatarUrl?: string | null;

  @ApiProperty({ example: '+628123456789', required: false })
  phone?: string | null;

  @ApiProperty({ example: ['ADMIN', 'USER'] })
  roles: string[];

  @ApiProperty({ example: true, required: false })
  googleLinked?: boolean;

  @ApiProperty({ example: 'person@gmail.com', required: false })
  googleEmail?: string | null;

  @ApiProperty({ example: 'Google User', required: false })
  googleName?: string | null;

  @ApiProperty({
    example: 'https://lh3.googleusercontent.com/....',
    required: false,
  })
  googleAvatarUrl?: string | null;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  refresh_token: string;

  @ApiProperty({ type: UserDto })
  user: UserDto;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token: string;
}

export class UploadProfileImageResponseDto {
  @ApiProperty({ example: '/uploads/avatars/1710000000-123456789.jpg' })
  avatarUrl: string;
}

export class UpdateProfileDto {
  @ApiProperty({ example: 'admin', required: false })
  @IsString()
  @MinLength(3)
  @IsOptional()
  username?: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsString()
  @MinLength(3)
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '+628123456789', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'data:image/png;base64,iVBORw0...', required: false })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
