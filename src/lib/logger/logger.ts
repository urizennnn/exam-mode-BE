import { Scope, Injectable, Inject } from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { createLogger, format, Logform, Logger, transports } from 'winston';
import { sprintf as sprintfJs } from 'sprintf-js';

export type Constructor<T = object> = new (...args: any[]) => T;

type LoggerSource = object | string | null;
type ContextType = string | Constructor | { name: string };
type TraceableError = Error | { stack?: string };

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

const Colors: Record<LogLevel, string> = {
  [LogLevel.DEBUG]: '\x1b[34m',
  [LogLevel.WARN]: '\x1b[33m',
  [LogLevel.INFO]: '\x1b[32m',
  [LogLevel.ERROR]: '\x1b[31m',
};

interface AppConfig {
  log_level?: LogLevel;
}

interface Config {
  app?: AppConfig;
}

const logger = createLogger({
  level: LogLevel.DEBUG,
  format: format.combine(
    format.splat(),
    format.simple(),
    format.json(),
    format.errors({ stack: true }),
    format.ms(),
    format.metadata(),
    format.prettyPrint({ depth: 0, colorize: true }),
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.splat(),
        format.metadata(),
        format.json(),
        format.simple(),
        format.errors({ stack: true }),
        format.ms(),
        format.colorize({ message: true }),
        format.timestamp({ format: 'MM/DD/YYYY, h:mm:ss A' }),
        format.align(),
        format.prettyPrint({ depth: 0, colorize: true }),
        format.printf((info: Logform.TransformableInfo) => {
          const { timestamp, level, message, context, trace, ms } = info;
          const levelStr = level as keyof typeof Colors;
          const c = (msg: string | number): string =>
            `${Colors[levelStr] || ''}${msg}\x1b[39m`;
          const traceObj = trace as TraceableError | undefined;
          return (
            `\x1b[35m[WORKKAP]\x1b[39m ${c(process.pid + '  -')} ${String(timestamp)}     ` +
            `${c(String(level).toUpperCase())} \x1b[33m[${String(context)}] ${String(message)} \x1b[33m${String(ms)}\x1b[39m` +
            `${traceObj?.stack ? `\n${traceObj.stack}` : ''}`
          );
        }),
      ),
    }),
  ],
});

function getLogLevel(config: ConfigService<Config>): LogLevel {
  try {
    const appConfig = config.get<AppConfig>('app');
    return appConfig?.log_level || LogLevel.DEBUG;
  } catch {
    return LogLevel.DEBUG;
  }
}

@Injectable({ scope: Scope.TRANSIENT })
export class DocentiLogger {
  private readonly logger: Logger;
  private context = '';

  constructor(
    @Inject(INQUIRER) source: LoggerSource,
    config: ConfigService<Config>,
  ) {
    const level = getLogLevel(config);
    logger.level = level;
    this.logger = logger;
    this.setContext(
      typeof source === 'string'
        ? source
        : (source?.constructor ?? DocentiLogger),
    );
  }

  setContext(context: ContextType): void {
    this.context = typeof context === 'string' ? context : context.name;
  }

  error(message: string, ...args: unknown[]): void {
    const lastArg = args.length > 0 ? args[args.length - 1] : undefined;
    const isTraceError = this.isErrorLike(lastArg);
    const messageArgs = isTraceError ? args.slice(0, -1) : args;
    this.logger.error({
      message: this.formatMessage(message, messageArgs),
      context: this.context,
      trace: isTraceError ? lastArg : undefined,
    });
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn({
      message: this.formatMessage(message, args),
      context: this.context,
    });
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info({
      message: this.formatMessage(message, args),
      context: this.context,
    });
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug({
      message: this.formatMessage(message, args),
      context: this.context,
    });
  }

  private isErrorLike(obj: unknown): obj is TraceableError {
    return (
      obj instanceof Error ||
      (obj !== null && typeof obj === 'object' && 'stack' in obj)
    );
  }

  private formatMessage(message: string, args: unknown[]): string {
    if (args.length === 0) return message;
    try {
      return sprintfJs(message, ...args);
    } catch {
      return `${message} ${args.map(String).join(' ')}`;
    }
  }
}
