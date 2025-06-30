import ddTrace from 'dd-trace';

const tracer = ddTrace.init({
  service: process.env.DD_SERVICE || 'exam-mod-be',
  env: process.env.DD_ENV || process.env.NODE_ENV || 'development',
  version: process.env.npm_package_version || '0.0.1',
  logInjection: true,
  runtimeMetrics: true,
  profiling: true,
});

export default tracer;
