import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from 'src/guards/auth.middleware';

export const NEEDS_AUTH = Symbol('NEEDS_AUTH');
export const NeedsAuth = (): MethodDecorator & ClassDecorator => {
  return applyDecorators(
    ApiBearerAuth(),
    SetMetadata(NEEDS_AUTH, true),
    UseGuards(JwtGuard),
  );
};
