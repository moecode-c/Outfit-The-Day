import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

export type Role = 'CUSTOMER' | 'SELLER' | 'ADMIN';
/** A class (not an interface) so it can appear in decorated signatures. */
export class AuthUser {
  id!: string;
  role!: Role;
  perms!: string[];
  name!: string;
  email!: string;
}

export const ROLES_KEY = 'roles';
export const PERM_KEY = 'perm';
export const PUBLIC_KEY = 'public';

/** Route requires one of these roles. Without @Roles a route only needs a logged-in user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Admin permission area (admins with '*' pass everything). */
export const AdminPerm = (perm: string) => SetMetadata(PERM_KEY, perm);
/** Route is public; user is still attached if a valid cookie exists. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext): AuthUser | undefined => {
  return ctx.switchToHttp().getRequest().user;
});

export const ACCESS_COOKIE = 'otd_at';
export const REFRESH_COOKIE = 'otd_rt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets);
    const token = req.cookies?.[ACCESS_COOKIE] ?? req.headers.authorization?.replace(/^Bearer /, '');
    if (token) {
      try {
        const p = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET });
        req.user = { id: p.sub, role: p.role, perms: p.perms ?? [], name: p.name, email: p.email } as AuthUser;
      } catch {
        /* expired or invalid */
      }
    }
    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException();

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException();

    const perm = this.reflector.getAllAndOverride<string>(PERM_KEY, targets);
    if (perm && req.user.role === 'ADMIN') {
      const p: string[] = req.user.perms;
      if (!p.includes('*') && !p.includes(perm)) throw new ForbiddenException('Missing admin permission: ' + perm);
    }
    return true;
  }
}
