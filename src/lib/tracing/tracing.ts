import ddTrace from 'dd-trace';

const options: Record<string, any> = {
  service: process.env.DD_SERVICE || 'exam-mod-be',
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '0.0.1',
  logInjection: true,
  runtimeMetrics: true,
  profiling: true,
};

// When no local Datadog agent is available, forward traces directly to Datadog's
// public intake. This requires an API key.
const apiKey = process.env.DD_API_KEY;
if (apiKey) {
  const site = process.env.DD_SITE || 'datadoghq.com';
  options.url = process.env.DD_TRACE_AGENT_URL || `https://trace.agent.${site}`;
  options.headers = {
    'DD-API-KEY': apiKey,
  };
}

const tracer = ddTrace.init(options);

export default tracer;
