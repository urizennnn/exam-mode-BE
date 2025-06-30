import { Global, Module } from '@nestjs/common';

import { DocentiLogger } from './logger';

@Global()
@Module({ providers: [DocentiLogger], exports: [DocentiLogger] })
export class LoggerModule {}
