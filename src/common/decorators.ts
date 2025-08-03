import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/auth.middleware';
import { RolesGuard } from 'src/guards/roles.guard';

export type Role = 'admin' | 'lecturer';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const NEEDS_AUTH = Symbol('NEEDS_AUTH');
export const NeedsAuth = (): MethodDecorator & ClassDecorator => {
  return applyDecorators(
    ApiBearerAuth(),
    SetMetadata(NEEDS_AUTH, true),
    UseGuards(JwtGuard, RolesGuard),
  );
};
