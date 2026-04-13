import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../../database/schema';
import { eq, and, gt } from 'drizzle-orm';

export interface JwtRefreshPayload {
  sub: number;
  tokenId: number;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private configService: ConfigService,
    @Inject(DrizzleAsyncProvider)
    private db: NodePgDatabase<typeof schema>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET') || 'your-refresh-secret-key',
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: JwtRefreshPayload) {
    const refreshToken = request.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Verify token exists in database and is not expired
    const [tokenRecord] = await this.db
      .select({
        token: schema.refreshTokens,
        user: schema.users,
      })
      .from(schema.refreshTokens)
      .innerJoin(schema.users, eq(schema.refreshTokens.userId, schema.users.id))
      .where(
        and(
          eq(schema.refreshTokens.id, payload.tokenId),
          eq(schema.refreshTokens.token, refreshToken),
          gt(schema.refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!tokenRecord || !tokenRecord.user.isActive) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      id: tokenRecord.user.id,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
      stationId: tokenRecord.user.stationId ?? null,
      tokenId: payload.tokenId,
    };
  }
}

