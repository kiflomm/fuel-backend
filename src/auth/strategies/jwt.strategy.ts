import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DrizzleAsyncProvider } from '../../database/drizzle.provider';
import { Inject } from '@nestjs/common';
import * as schema from '../../database/schema';
import { eq } from 'drizzle-orm';

export interface JwtPayload {
  sub: number;
  email: string;
  role:
    | 'ADMIN'
    | 'GENERAL_FINANCE'
    | 'COLLEGE_FINANCE'
    | 'FACILITATOR'
    | 'GENERAL_FACILITATOR'
    | 'GUEST';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @Inject(DrizzleAsyncProvider)
    private db: NodePgDatabase<typeof schema>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    const [user] = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub))
      .limit(1);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }
}

