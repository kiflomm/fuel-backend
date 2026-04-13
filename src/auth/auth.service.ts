import {
    Injectable,
    UnauthorizedException,
    NotFoundException,
    BadRequestException,
  } from '@nestjs/common';
  import { JwtService } from '@nestjs/jwt';
  import { ConfigService } from '@nestjs/config';
  import * as bcrypt from 'bcrypt';
  import { NodePgDatabase } from 'drizzle-orm/node-postgres';
  import { DrizzleAsyncProvider } from '../database/drizzle.provider';
  import { Inject } from '@nestjs/common';
  import * as schema from '../database/schema';
  import { eq, and, gt } from 'drizzle-orm';
  import {
    LoginDto,
    RegisterDto,
    ForgotPasswordDto,
    ResetPasswordDto,
    ChangePasswordDto,
    UpdateProfileDto,
  } from './dto/dto.export';
  import { randomBytes, createHash } from 'crypto';
  import { MailerService } from '../mailer/mailer.service';
  import type { UserRole } from '../database/enums';
  
  @Injectable()
  export class AuthService {
    constructor(
      @Inject(DrizzleAsyncProvider)
      private db: NodePgDatabase<typeof schema>,
      private jwtService: JwtService,
      private configService: ConfigService,
      private readonly mailerService: MailerService,
    ) { }
  
    async validateUser(email: string, password: string) {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1);
  
      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      const isPasswordValid = await bcrypt.compare(password, user.password);
  
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      if (!user.isActive) {
        throw new UnauthorizedException('Account is inactive');
      }
  
      return user;
    }
  
    async register(_registerDto: RegisterDto): Promise<{
      accessToken: string;
      refreshToken: string;
      user: {
        id: string;
        email: string;
        firstName: string;
        lastName: string;
        role: UserRole;
        stationId: number | null;
        isActive: boolean;
        createdAt: string;
        updatedAt: string;
      };
    }> {
      throw new BadRequestException(
        'Public registration is disabled. Accounts are created by a government administrator.',
      );
    }
  
    async login(loginDto: LoginDto) {
      const user = await this.validateUser(loginDto.email, loginDto.password);
  
      const tokens = await this.generateTokens(user);
  
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          stationId: user.stationId ?? null,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      };
    }
  
    async refreshToken(userId: number, tokenId: number) {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
  
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }
  
      // Delete old refresh token
      await this.db
        .delete(schema.refreshTokens)
        .where(eq(schema.refreshTokens.id, tokenId));
  
      // Generate new tokens
      const tokens = await this.generateTokens(user);
  
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id.toString(),
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          stationId: user.stationId ?? null,
          isActive: user.isActive,
          createdAt: user.createdAt.toISOString(),
          updatedAt: user.updatedAt.toISOString(),
        },
      };
    }
  
    async logout(tokenId: number) {
      await this.db
        .delete(schema.refreshTokens)
        .where(eq(schema.refreshTokens.id, tokenId));
    }
  
    async getProfile(userId: number) {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
  
      if (!user) {
        throw new NotFoundException('User not found');
      }
  
      return {
        id: user.id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        stationId: user.stationId ?? null,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
    }
  
    async updateProfile(userId: number, updateProfileDto: UpdateProfileDto) {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
  
      if (!user) {
        throw new NotFoundException('User not found');
      }
  
      // Build update object with only provided fields
      const updateData: Partial<{
        firstName: string;
        lastName: string;
        updatedAt: Date;
      }> = {
        updatedAt: new Date(),
      };
  
      if (updateProfileDto.firstName !== undefined) {
        updateData.firstName = updateProfileDto.firstName;
      }
  
      if (updateProfileDto.lastName !== undefined) {
        updateData.lastName = updateProfileDto.lastName;
      }
  
      // Note: phone field is not in the users table schema
      // If you need to support phone, add it to the database schema first
  
      const [updatedUser] = await this.db
        .update(schema.users)
        .set(updateData)
        .where(eq(schema.users.id, userId))
        .returning();
  
      return {
        id: updatedUser.id.toString(),
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        role: updatedUser.role,
        stationId: updatedUser.stationId ?? null,
        isActive: updatedUser.isActive,
        createdAt: updatedUser.createdAt.toISOString(),
        updatedAt: updatedUser.updatedAt.toISOString(),
      };
    }
  
    async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, forgotPasswordDto.email))
        .limit(1);
  
      if (!user) {
        // Don't reveal if email exists for security
        return { message: 'If the email exists, a password reset code has been sent' };
      }
  
      // Generate 6-digit reset code and store hashed version
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const hashedCode = createHash('sha256').update(resetCode).digest('hex');
      const resetCodeExpiry = new Date();
      resetCodeExpiry.setMinutes(resetCodeExpiry.getMinutes() + 10); // 10 minute expiry
  
      await this.db
        .update(schema.users)
        .set({
          resetPasswordToken: hashedCode,
          resetPasswordExpiresAt: resetCodeExpiry,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id));
  
      try {
        await this.mailerService.sendPasswordResetEmail(user.email, resetCode);
      } catch (error) {
        // Log the error but don't reveal email sending failure to user for security
        // This prevents email enumeration attacks
        console.error('Failed to send password reset email:', error);
        // Still return success message to user
      }
  
      return {
        message: 'If the email exists, a password reset code has been sent',
      };
    }
  
    async verifyResetCode(code: string): Promise<{ valid: boolean }> {
      const hashedCode = createHash('sha256').update(code).digest('hex');
  
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.resetPasswordToken, hashedCode),
            gt(schema.users.resetPasswordExpiresAt, new Date()),
          ),
        )
        .limit(1);
  
      if (!user) {
        throw new BadRequestException('Invalid or expired password reset code');
      }
  
      return { valid: true };
    }
  
    async resetPassword(resetPasswordDto: ResetPasswordDto) {
      const hashedCode = createHash('sha256').update(resetPasswordDto.code).digest('hex');
  
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.resetPasswordToken, hashedCode),
            gt(schema.users.resetPasswordExpiresAt, new Date()),
          ),
        )
        .limit(1);
  
      if (!user) {
        throw new BadRequestException('Invalid or expired password reset code');
      }
  
      const hashedPassword = await bcrypt.hash(resetPasswordDto.password, 10);
  
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            password: hashedPassword,
            resetPasswordToken: null,
            resetPasswordExpiresAt: null,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, user.id));
  
        await tx.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, user.id));
      });
    }
  
    async changePassword(userId: number, changePasswordDto: ChangePasswordDto) {
      // Get user from database
      const [user] = await this.db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1);
  
      if (!user) {
        throw new NotFoundException('User not found');
      }
  
      // Validate current password
      const isCurrentPasswordValid = await bcrypt.compare(
        changePasswordDto.currentPassword,
        user.password,
      );
  
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
  
      // Hash new password
      const hashedNewPassword = await bcrypt.hash(changePasswordDto.newPassword, 10);
  
      // Update password and invalidate all refresh tokens for security
      await this.db.transaction(async (tx) => {
        await tx
          .update(schema.users)
          .set({
            password: hashedNewPassword,
            updatedAt: new Date(),
          })
          .where(eq(schema.users.id, user.id));
  
        // Invalidate all refresh tokens for this user
        await tx.delete(schema.refreshTokens).where(eq(schema.refreshTokens.userId, user.id));
      });
    }
  
    private async generateTokens(user: typeof schema.users.$inferSelect) {
      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        stationId: user.stationId ?? null,
      };
  
      // Access token uses default options from JWT module configuration
      const accessToken = this.jwtService.sign(payload);
  
      // Calculate expiry date for refresh token
      const expiresAt = new Date();
      const refreshExpirationStr = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
      const days = parseInt(refreshExpirationStr.replace('d', '')) || 7;
      expiresAt.setDate(expiresAt.getDate() + days);
  
      // Save refresh token to database first to get the ID
      const [savedToken] = await this.db
        .insert(schema.refreshTokens)
        .values({
          userId: user.id,
          token: '', // Temporary, will update after generating JWT
          expiresAt,
        })
        .returning();
  
      // Generate refresh token with tokenId
      const refreshTokenPayload = {
        sub: user.id,
        tokenId: savedToken.id,
      };
  
      const refreshTokenExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';
      const refreshToken = this.jwtService.sign(refreshTokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'your-refresh-secret-key',
        expiresIn: refreshTokenExpiration,
      } as any);
  
      // Update the token in database with the actual JWT
      await this.db
        .update(schema.refreshTokens)
        .set({ token: refreshToken })
        .where(eq(schema.refreshTokens.id, savedToken.id));
  
      return {
        accessToken,
        refreshToken,
      };
    }
  }
  
  