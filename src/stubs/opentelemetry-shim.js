// OpenTelemetry shim for browser environment
// This provides empty implementations for OpenTelemetry functionality

const noopTracer = {
  startSpan: () => ({
    end: () => {},
    updateName: () => {},
    setAttribute: () => {},
    setAttributes: () => {},
    recordException: () => {},
    setStatus: () => {},
    isRecording: () => false,
  }),
  getCurrentSpan: () => null,
  withSpan: (span, fn) => fn(),
  bind: (fn) => fn,
};

const noopTracerProvider = {
  getTracer: () => noopTracer,
};

module.exports = {
  trace: {
    getTracer: () => noopTracer,
    setSpan: () => {},
    getSpan: () => null,
    getTracerProvider: () => noopTracerProvider,
  },
  context: {
    active: () => ({}),
    bind: (context, target) => target,
    with: (context, fn) => fn(),
  },
}; 