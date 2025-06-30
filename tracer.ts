import tracer, { Span } from 'dd-trace';

interface DatabaseQuery {
  text?: string;
  rowCount?: number;
}

interface RedisCommand {
  command?: string;
  args?: string[];
}

interface HttpRequest {
  headers?: Record<string, string | string[]>;
  route?: {
    path?: string;
  };
}

interface TracerHooks {
  query?: (span: Span, query: DatabaseQuery) => void;
  command?: (span: Span, command: RedisCommand) => void;
  request?: (span: Span, req: HttpRequest) => void;
}

interface PluginConfig {
  enabled: boolean;
  service?: string;
  hooks?: TracerHooks;
}

tracer.init({
  service: process.env.DD_SERVICE || 'your-app-name',
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  version: process.env.DD_VERSION || '1.0.0',

  hostname: process.env.DD_AGENT_HOST || 'localhost',
  port: process.env.DD_TRACE_AGENT_PORT || 8126,

  flushInterval: 2000, 

  tags: {
    'app.type': 'backend',
    'app.framework': 'nestjs',
    'app.database': 'postgresql',
    'app.cache': 'redis',
    'aws.service': 'app-runner',
    'aws.region': process.env.AWS_REGION || 'us-east-1',
  },

  logInjection: true, 

  profiling: process.env.NODE_ENV === 'production',

  runtimeMetrics: true, 

  plugins: true,

  sampleRate: process.env.DD_TRACE_SAMPLE_RATE
    ? parseFloat(process.env.DD_TRACE_SAMPLE_RATE)
    : process.env.NODE_ENV === 'production'
      ? 0.1
      : 1.0,
});

tracer.use('pg', {
  enabled: true,
  service: `${process.env.DD_SERVICE || 'your-app'}-postgres`,
  hooks: {
    query: (span: Span, query: DatabaseQuery) => {
      if (query.text) {
        span.setTag('db.statement', query.text);
      }
      span.setTag('db.rows_affected', query.rowCount || 0);
    },
  },
} as PluginConfig);

tracer.use('redis', {
  enabled: true,
  service: `${process.env.DD_SERVICE || 'your-app'}-redis`,
  hooks: {
    command: (span: Span, command: RedisCommand) => {
      if (command.command) {
        span.setTag('redis.command', command.command);
      }
      if (command.args && command.args.length > 0) {
        span.setTag('redis.key', command.args[0]);
      }
    },
  },
} as PluginConfig);

tracer.use('http', {
  enabled: true,
  hooks: {
    request: (span: Span, req: HttpRequest) => {
      if (req.headers) {
        const userAgent = req.headers['user-agent'];
        const requestId = req.headers['x-request-id'];

        if (userAgent) {
          span.setTag(
            'http.user_agent',
            Array.isArray(userAgent) ? userAgent[0] : userAgent,
          );
        }
        if (requestId) {
          span.setTag(
            'http.request_id',
            Array.isArray(requestId) ? requestId[0] : requestId,
          );
        }
      }
    },
  },
} as PluginConfig);

tracer.use('express', {
  enabled: true,
  hooks: {
    request: (span: Span, req: HttpRequest) => {
      // Add route information
      if (req.route?.path) {
        span.setTag('express.route', req.route.path);
      }
    },
  },
} as PluginConfig);

tracer.use('dns', {
  enabled: true,
} as PluginConfig);

tracer.use('fs', {
  enabled: process.env.NODE_ENV === 'development',
} as PluginConfig);

// Set up custom logger integration with proper typing
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// Enhanced console methods with trace injection
console.log = (...args: any[]) => {
  const span = tracer.scope().active();
  if (span) {
    originalConsoleLog(
      `[trace_id=${span.context().toTraceId()} span_id=${span.context().toSpanId()}]`,
      ...args,
    );
  } else {
    originalConsoleLog(...args);
  }
};

console.error = (...args: any[]) => {
  const span = tracer.scope().active();
  if (span) {
    originalConsoleError(
      `[trace_id=${span.context().toTraceId()} span_id=${span.context().toSpanId()}]`,
      ...args,
    );
  } else {
    originalConsoleError(...args);
  }
};

console.warn = (...args: any[]) => {
  const span = tracer.scope().active();
  if (span) {
    originalConsoleWarn(
      `[trace_id=${span.context().toTraceId()} span_id=${span.context().toSpanId()}]`,
      ...args,
    );
  } else {
    originalConsoleWarn(...args);
  }
};

// Custom utility functions for manual instrumentation with proper typing
export const createCustomSpan = <T>(
  operationName: string,
  callback: (span: Span) => Promise<T> | T,
): Promise<T> => {
  return tracer.trace(operationName, async (span: Span) => {
    try {
      const result = await callback(span);
      span.setTag('operation.success', true);
      return result;
    } catch (error) {
      span.setTag('operation.success', false);
      span.setTag('error', true);

      // Safely handle error properties
      if (error instanceof Error) {
        span.setTag('error.message', error.message);
        span.setTag('error.stack', error.stack || '');
      } else {
        span.setTag('error.message', String(error));
      }

      throw error;
    }
  });
};

// Custom metrics helper with proper typing
export const incrementCounter = (
  metricName: string,
  value = 1,
  tags: Record<string, string> = {},
): void => {
  if (tracer.dogstatsd) {
    tracer.dogstatsd.increment(metricName, value, tags);
  }
};

export const recordHistogram = (
  metricName: string,
  value: number,
  tags: Record<string, string> = {},
): void => {
  if (tracer.dogstatsd) {
    tracer.dogstatsd.histogram(metricName, value, tags);
  }
};

// Utility function to get current trace context
export const getCurrentTraceContext = () => {
  const span = tracer.scope().active();
  if (span) {
    return {
      traceId: span.context().toTraceId(),
      spanId: span.context().toSpanId(),
    };
  }
  return null;
};

// Utility function to add custom tags to current span
export const addCustomTags = (
  tags: Record<string, string | number | boolean>,
): void => {
  const span = tracer.scope().active();
  if (span) {
    Object.entries(tags).forEach(([key, value]) => {
      span.setTag(key, value);
    });
  }
};

// Export configured tracer
export default tracer;
