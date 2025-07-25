export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export type BreadcrumbType =
  | "navigation"
  | "http"
  | "click"
  | "error"
  | "debug"
  | "info"
  | "user"
  | "system"
  | "default";

export type Breadcrumb = {
  type: BreadcrumbType;
  category: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
  level?: LogLevel;
};

export type User = {
  id?: string;
  email?: string;
  username?: string;
  ip_address?: string;
  [key: string]: unknown;
};

export type Release = {
  version: string;
  name?: string;
  build?: string;
  commit?: string;
  date?: string;
};

export type Transport = "fetch" | "xhr" | "beacon";

export interface Scope {
  user?: User;
  tags: Record<string, string>;
  extras: Record<string, unknown>;
  contexts: Record<string, Record<string, unknown>>;
  breadcrumbs: Breadcrumb[];
  fingerprint?: string[];
  level?: LogLevel;
}

export interface LogMessage {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
  error?: Error;
  user?: User;
  tags?: Record<string, string>;
  breadcrumbs?: Breadcrumb[];
  session?: string;
  release?: Release;
  environment?: string;
  fingerprint?: string[];
  stacktrace?: string;
  extra?: Record<string, unknown>;
  platform?: string;
  sdk?: {
    name: string;
    version: string;
  };
}

export interface LoggerConfig {
  dsn?: string;
  release?: Release;
  environment?: "production" | "development" | "staging" | "test" | string;
  debug?: boolean;
  enableConsoleLogging?: boolean;
  maxBreadcrumbs?: number;
  attachStacktrace?: boolean;
  ignoreErrors?: Array<string | RegExp>;
  sampleRate?: number;
  transport?: Transport;
  beforeSend?: (logMessage: LogMessage) => LogMessage | null;
  beforeBreadcrumb?: (breadcrumb: Breadcrumb) => Breadcrumb | null;
  integrations?: LoggerIntegration[];
  defaultTags?: Record<string, string>;
  defaultContext?: Record<string, unknown>;
  maxMessageLength?: number;
  tracesSampleRate?: number;
  sessionTimeoutMs?: number;
  autoSessionTracking?: boolean;
  sendDefaultPii?: boolean;
  initialScope?: Partial<Scope>;
}

export interface LoggerIntegration {
  name: string;
  setupOnce(): void;
}

export interface EventHint {
  originalException?: Error;
  syntheticException?: Error;
  data?: unknown;
}

// Built-in integrations
export class GlobalHandlersIntegration implements LoggerIntegration {
  name = "GlobalHandlers";
  private logger?: Logger;

  setupOnce(): void {
    this.logger = Logger.getInstance();

    // Global error handler
    window.addEventListener("error", (event) => {
      this.logger?.captureException(event.error || new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener("unhandledrejection", (event) => {
      this.logger?.captureException(
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason)),
        { type: "unhandledrejection" },
      );
    });
  }
}

export class BreadcrumbsIntegration implements LoggerIntegration {
  name = "Breadcrumbs";
  private logger?: Logger;

  setupOnce(): void {
    this.logger = Logger.getInstance();

    // Console breadcrumbs
    this.instrumentConsole();

    // DOM breadcrumbs
    this.instrumentDOM();

    // History breadcrumbs
    this.instrumentHistory();

    // Fetch breadcrumbs
    this.instrumentFetch();
  }

  private instrumentConsole(): void {
    ["debug", "info", "warn", "error"].forEach((level) => {
      const original = console[level as keyof Console] as Function;
      // @ts-ignore
      console[level as keyof Console] = (...args: unknown[]) => {
        this.logger?.addBreadcrumb({
          type: "debug",
          category: "console",
          message: args.join(" "),
          level: level as LogLevel,
          data: { arguments: args },
        });
        original.apply(console, args);
      };
    });
  }

  private instrumentDOM(): void {
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target as Element;
        this.logger?.addBreadcrumb({
          type: "click",
          category: "ui.click",
          message:
            target.tagName.toLowerCase() + (target.id ? `#${target.id}` : ""),
          data: {
            tagName: target.tagName,
            id: target.id,
            className: target.className,
          },
        });
      },
      true,
    );
  }

  private instrumentHistory(): void {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      Logger.getInstance().addBreadcrumb({
        type: "navigation",
        category: "navigation",
        message: `Navigation to ${args[2]}`,
        data: { to: args[2] },
      });
      return originalPushState.apply(this, args);
    };

    history.replaceState = function (...args) {
      Logger.getInstance().addBreadcrumb({
        type: "navigation",
        category: "navigation",
        message: `Navigation to ${args[2]}`,
        data: { to: args[2] },
      });
      return originalReplaceState.apply(this, args);
    };
  }

  private instrumentFetch(): void {
    const originalFetch = window.fetch;
    // @ts-ignore
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const url = input instanceof Request ? input.url : input.toString();
      const method =
        init?.method || (input instanceof Request && input.method) || "GET";

      const startTime = Date.now();

      try {
        const response = await originalFetch(input, init);
        const duration = Date.now() - startTime;

        Logger.getInstance().addBreadcrumb({
          type: "http",
          category: "fetch",
          message: `${method} ${url}`,
          data: {
            url,
            method,
            status_code: response.status,
            duration,
          },
          level: response.ok ? "info" : "error",
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;

        Logger.getInstance().addBreadcrumb({
          type: "http",
          category: "fetch",
          message: `${method} ${url}`,
          data: {
            url,
            method,
            error: error instanceof Error ? error.message : String(error),
            duration,
          },
          level: "error",
        });

        throw error;
      }
    };
  }
}

export class Logger {
  private static instance: Logger;
  private readonly config: Required<LoggerConfig>;
  private readonly scope: Scope;
  private readonly session: string;
  private sessionStart: number;
  private integrations: LoggerIntegration[] = [];

  private readonly logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  private readonly emojis: Record<LogLevel, string> = {
    debug: "🔍",
    info: "ℹ️",
    warn: "⚠️",
    error: "❌",
    fatal: "💀",
  };

  private readonly colors: Record<LogLevel, string> = {
    debug: "#6B7280",
    info: "#3B82F6",
    warn: "#F59E0B",
    error: "#EF4444",
    fatal: "#7C2D12",
  };

  private constructor(config: LoggerConfig = {}) {
    this.config = {
      environment: "development",
      debug: config.environment !== "production",
      enableConsoleLogging: config.environment !== "production",
      maxBreadcrumbs: 100,
      attachStacktrace: true,
      sampleRate: 1.0,
      transport: "fetch",
      maxMessageLength: 8192,
      tracesSampleRate: 1.0,
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      autoSessionTracking: true,
      sendDefaultPii: false,
      ignoreErrors: [],
      integrations: [
        new GlobalHandlersIntegration(),
        new BreadcrumbsIntegration(),
      ],
      defaultTags: {},
      defaultContext: {},
      initialScope: {},
      ...config,
      // @ts-ignore
      beforeSend: config.beforeSend,
      // @ts-ignore
      beforeBreadcrumb: config.beforeBreadcrumb,
    };

    this.scope = {
      tags: { ...this.config.defaultTags },
      extras: { ...this.config.defaultContext },
      contexts: {
        browser: this.getBrowserContext(),
        device: this.getDeviceContext(),
        runtime: this.getRuntimeContext(),
      },
      breadcrumbs: [],
      ...this.config.initialScope,
    };

    this.session = this.generateSessionId();
    this.sessionStart = Date.now();

    this.setupIntegrations();
  }

  private getBrowserContext(): Record<string, unknown> {
    return {
      name: navigator.userAgent,
      version: navigator.appVersion,
      language: navigator.language,
      cookieEnabled: navigator.cookieEnabled,
      onLine: navigator.onLine,
    };
  }

  private getDeviceContext(): Record<string, unknown> {
    return {
      screen: {
        width: screen.width,
        height: screen.height,
        colorDepth: screen.colorDepth,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  private getRuntimeContext(): Record<string, unknown> {
    return {
      name: "browser",
      url: window.location.href,
      referrer: document.referrer,
    };
  }

  private setupIntegrations(): void {
    this.integrations = [...this.config.integrations];
    this.integrations.forEach((integration) => {
      try {
        integration.setupOnce();
      } catch (error) {
        console.error(
          `Failed to setup integration ${integration.name}:`,
          error,
        );
      }
    });
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  public static getInstance(config?: LoggerConfig): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  public static init(config: LoggerConfig): Logger {
    Logger.instance = new Logger(config);
    return Logger.instance;
  }

  private shouldSample(): boolean {
    return Math.random() < this.config.sampleRate;
  }

  private shouldIgnoreError(error: Error): boolean {
    return this.config.ignoreErrors.some((pattern) => {
      if (pattern instanceof RegExp) {
        return pattern.test(error.message) || pattern.test(error.stack || "");
      }
      return (
        error.message.includes(pattern) || (error.stack || "").includes(pattern)
      );
    });
  }

  private extractStackTrace(error?: Error): string | undefined {
    if (!this.config.attachStacktrace) return undefined;
    if (!error?.stack) return undefined;

    return error.stack
      .split("\n")
      .slice(1) // Remove the error message line
      .map((line) => line.trim())
      .join("\n");
  }

  private truncateMessage(message: string): string {
    if (message.length <= this.config.maxMessageLength) return message;
    return message.substring(0, this.config.maxMessageLength - 3) + "...";
  }

  private isSessionExpired(): boolean {
    return Date.now() - this.sessionStart > this.config.sessionTimeoutMs;
  }

  private renewSession(): void {
    if (this.isSessionExpired()) {
      (this as any).session = this.generateSessionId();
      this.sessionStart = Date.now();
    }
  }

  // Public API methods
  public setUser(user: User): void {
    this.scope.user = { ...this.scope.user, ...user };
  }

  public setTag(key: string, value: string): void {
    this.scope.tags[key] = value;
  }

  public setTags(tags: Record<string, string>): void {
    Object.assign(this.scope.tags, tags);
  }

  public setExtra(key: string, value: unknown): void {
    this.scope.extras[key] = value;
  }

  public setExtras(extras: Record<string, unknown>): void {
    Object.assign(this.scope.extras, extras);
  }

  public setContext(name: string, context: Record<string, unknown>): void {
    this.scope.contexts[name] = context;
  }

  public setLevel(level: LogLevel): void {
    this.scope.level = level;
  }

  public setFingerprint(fingerprint: string[]): void {
    this.scope.fingerprint = fingerprint;
  }

  public addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
    const processedBreadcrumb = this.config.beforeBreadcrumb
      ? this.config.beforeBreadcrumb({
          ...breadcrumb,
          timestamp: new Date().toISOString(),
        })
      : { ...breadcrumb, timestamp: new Date().toISOString() };

    if (!processedBreadcrumb) return;

    this.scope.breadcrumbs.push(processedBreadcrumb);

    if (this.scope.breadcrumbs.length > this.config.maxBreadcrumbs) {
      this.scope.breadcrumbs.shift();
    }
  }

  public clearBreadcrumbs(): void {
    this.scope.breadcrumbs = [];
  }

  public withScope<T>(callback: (scope: Scope) => T): T {
    const originalScope = { ...this.scope };
    try {
      return callback(this.scope);
    } finally {
      Object.assign(this.scope, originalScope);
    }
  }

  private async createLogMessage(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    hint?: EventHint,
  ): Promise<LogMessage> {
    this.renewSession();

    const logMessage: LogMessage = {
      level: this.scope.level || level,
      message: this.truncateMessage(message),
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        ...this.scope.extras,
      },
      error,
      user: this.scope.user,
      tags: { ...this.scope.tags },
      breadcrumbs: [...this.scope.breadcrumbs],
      session: this.session,
      release: this.config.release,
      environment: this.config.environment,
      fingerprint: this.scope.fingerprint,
      stacktrace: this.extractStackTrace(error || hint?.syntheticException),
      extra: this.scope.extras,
      platform: "javascript",
      sdk: {
        name: "enhanced-browser-logger",
        version: "2.0.0",
      },
    };

    return this.config.beforeSend
      ? this.config.beforeSend(logMessage) || logMessage
      : logMessage;
  }

  private async sendToDSN(logMessage: LogMessage): Promise<void> {
    if (!this.config.dsn || !this.shouldSample()) return;

    try {
      const payload = {
        ...logMessage,
        timestamp: logMessage.timestamp,
        server_name: window.location.hostname,
        modules: {},
      };

      const transport = this.config.transport;

      if (transport === "beacon" && "sendBeacon" in navigator) {
        navigator.sendBeacon(this.config.dsn, JSON.stringify(payload));
      } else if (transport === "xhr") {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", this.config.dsn);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.send(JSON.stringify(payload));
      } else {
        await fetch(this.config.dsn, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": navigator.userAgent,
          },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      }
    } catch (error) {
      if (this.config.debug) {
        console.error("Failed to send log to DSN:", error);
      }
    }
  }

  private logToConsole(logMessage: LogMessage): void {
    if (!this.config.enableConsoleLogging) return;

    const emoji = this.emojis[logMessage.level];
    const color = this.colors[logMessage.level];
    const timestamp = new Date(logMessage.timestamp).toLocaleTimeString();
    const prefix = `${emoji} [${logMessage.level.toUpperCase()}] ${timestamp}:`;

    console.group(`%c${prefix}`, `color: ${color}; font-weight: bold;`);
    console.log(`%c${logMessage.message}`, `color: ${color};`);

    if (logMessage.context && Object.keys(logMessage.context).length > 0) {
      console.log("📋 Context:", logMessage.context);
    }

    if (logMessage.tags && Object.keys(logMessage.tags).length > 0) {
      console.log("🏷️ Tags:", logMessage.tags);
    }

    if (logMessage.user) {
      console.log("👤 User:", logMessage.user);
    }

    if (logMessage.breadcrumbs && logMessage.breadcrumbs.length > 0) {
      console.log("🍞 Breadcrumbs:", logMessage.breadcrumbs.slice(-5)); // Show last 5
    }

    if (logMessage.error) {
      console.error("💥 Error:", logMessage.error);
    }

    if (logMessage.session) {
      console.log("🔐 Session:", logMessage.session);
    }

    console.groupEnd();
  }

  private async log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
    hint?: EventHint,
  ): Promise<void> {
    if (error && this.shouldIgnoreError(error)) return;

    const logMessage = await this.createLogMessage(
      level,
      message,
      context,
      error,
      hint,
    );
    if (!logMessage) return;

    this.logToConsole(logMessage);
    await this.sendToDSN(logMessage);
  }

  // Logging methods
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log("debug", message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log("info", message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log("warn", message, context);
  }

  public error(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.log("error", message, context, error);
  }

  public fatal(
    message: string,
    error?: Error,
    context?: Record<string, unknown>,
  ): void {
    this.log("fatal", message, context, error);
  }

  public captureException(
    error: Error,
    context?: Record<string, unknown>,
    hint?: EventHint,
  ): void {
    this.log("error", error.message, context, error, hint);
  }

  public captureMessage(
    message: string,
    level: LogLevel = "info",
    context?: Record<string, unknown>,
  ): void {
    this.log(level, message, context);
  }

  // Performance monitoring
  public startTransaction(name: string): Transaction {
    return new Transaction(name, this);
  }

  // Utility methods
  public flush(timeout = 5000): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(true), timeout);
    });
  }

  public close(): Promise<boolean> {
    return this.flush();
  }
}

// Transaction class for performance monitoring
export class Transaction {
  private startTime: number;
  private spans: Span[] = [];

  constructor(
    private name: string,
    private logger: Logger,
  ) {
    this.startTime = performance.now();
  }

  public startSpan(operation: string): Span {
    const span = new Span(operation, this.logger);
    this.spans.push(span);
    return span;
  }

  public finish(): void {
    const duration = performance.now() - this.startTime;
    this.logger.info(`Transaction ${this.name} completed`, {
      transaction: this.name,
      duration,
      spans: this.spans.length,
    });
  }
}

export class Span {
  private startTime: number;

  constructor(
    private operation: string,
    private logger: Logger,
  ) {
    this.startTime = performance.now();
  }

  public finish(): void {
    const duration = performance.now() - this.startTime;
    this.logger.debug(`Span ${this.operation} completed`, {
      span: this.operation,
      duration,
    });
  }
}

// Convenience functions
export const logger = Logger.getInstance();

export function init(config: LoggerConfig): Logger {
  return Logger.init(config);
}

export function captureException(
  error: Error,
  context?: Record<string, unknown>,
): void {
  logger.captureException(error, context);
}

export function captureMessage(
  message: string,
  level?: LogLevel,
  context?: Record<string, unknown>,
): void {
  logger.captureMessage(message, level, context);
}

export function setUser(user: User): void {
  logger.setUser(user);
}

export function setTag(key: string, value: string): void {
  logger.setTag(key, value);
}

export function setExtra(key: string, value: unknown): void {
  logger.setExtra(key, value);
}

export function addBreadcrumb(breadcrumb: Omit<Breadcrumb, "timestamp">): void {
  logger.addBreadcrumb(breadcrumb);
}

export function withScope<T>(callback: (scope: Scope) => T): T {
  return logger.withScope(callback);
}

// Usage Examples:
/*
// Basic initialization
import { init, captureException, captureMessage, setUser } from './logger';

init({
  dsn: 'https://your-logging-endpoint.com/api/logs',
  environment: 'production',
  release: {
    version: '1.0.0',
    name: 'MyApp',
    commit: 'abc123',
  },
  debug: false,
  sampleRate: 0.1, // Sample 10% of events in production
  beforeSend: (logMessage) => {
    // Filter out or modify logs before sending
    if (logMessage.message.includes('sensitive')) {
      return null; // Don't send this log
    }
    return logMessage;
  },
  defaultTags: {
    component: 'frontend',
    version: '1.0.0',
  },
});

// Set user context
setUser({
  id: '12345',
  email: 'user@example.com',
  username: 'johndoe',
});

// Capture exceptions
try {
  throw new Error('Something went wrong');
} catch (error) {
  captureException(error, { action: 'user_action' });
}

// Capture messages
captureMessage('User performed important action', 'info', {
  userId: '12345',
  action: 'purchase',
});

// Use with scope for temporary context
withScope((scope) => {
  scope.setTag('feature', 'checkout');
  scope.setLevel('error');
  captureMessage('Checkout failed');
});

// Performance monitoring
const transaction = logger.startTransaction('page_load');
const span = transaction.startSpan('api_call');
// ... do work
span.finish();
transaction.finish();
*/
