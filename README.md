# 🚀 Enhanced Cloud Logger

[![npm version](https://badge.fury.io/js/@pilab/log.svg)](https://badge.fury.io/js/@pilab/log)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/pilab-dev/log)](https://bundlephobia.com/package/@pilab/log)

> A powerful, Sentry-like cloud logging solution with automatic instrumentation, rich development experience, and production-ready features.

## ✨ Features

- 🔍 **Automatic Instrumentation** - Captures errors, HTTP requests, user interactions, and navigation events
- 🎨 **Rich Development Experience** - Beautiful console logging with colors, emojis, and grouping
- 🏗️ **Production Ready** - Sampling, filtering, multiple transport methods, and performance optimization
- 🔧 **Highly Configurable** - Environment-aware settings with extensive customization options
- 📊 **Performance Monitoring** - Transaction and span tracking for performance insights
- 🎯 **TypeScript First** - Full TypeScript support with comprehensive type definitions
- 🔄 **Multiple Integrations** - Extensible plugin system for custom functionality
- 📱 **Cross-Platform** - Works in all modern browsers and environments

## 📦 Installation

```bash
npm install @pilab/log
```

```bash
yarn add @pilab/log
```

```bash
pnpm add @pilab/log
```

```bash
bun add @pilab/log
```

## 🚀 Quick Start

### Basic Setup

```typescript
import { init, captureException, captureMessage } from "@pilab/log";

// Initialize the logger
init({
  dsn: "https://your-logging-endpoint.com/api/logs",
  environment: "production",
  release: {
    version: "1.0.0",
    name: "MyApp",
  },
});

// Start logging!
captureMessage("Application started", "info");

try {
  // Your application code
  throw new Error("Something went wrong!");
} catch (error) {
  captureException(error);
}
```

### Development vs Production

```typescript
// Development - Rich console logging enabled
init({
  environment: "development",
  debug: true,
  enableConsoleLogging: true,
});

// Production - Optimized for performance
init({
  dsn: "https://your-endpoint.com/api/logs",
  environment: "production",
  debug: false,
  sampleRate: 0.1, // Sample 10% of events
  enableConsoleLogging: false,
});
```

## 📚 API Documentation

### Initialization

```typescript
import { init } from '@pilab/log';

init({
  dsn?: string;                    // Your logging endpoint
  environment?: string;            // 'production' | 'development' | 'staging'
  debug?: boolean;                 // Enable debug mode
  enableConsoleLogging?: boolean;  // Enable/disable console output
  release?: {                      // Release information
    version: string;
    name?: string;
    commit?: string;
  };
  sampleRate?: number;            // 0.0 to 1.0 sampling rate
  maxBreadcrumbs?: number;        // Max breadcrumbs to keep
  transport?: 'fetch' | 'xhr' | 'beacon';
  // ... and many more options
});
```

### Logging Methods

```typescript
import { logger } from "@pilab/log";

// Different log levels
logger.debug("Debug information", { userId: "123" });
logger.info("Information message", { action: "user_login" });
logger.warn("Warning message", { performance: "slow" });
logger.error("Error occurred", new Error("Details"), { context: "checkout" });
logger.fatal("Critical error", new Error("System failure"));

// Capture exceptions with context
logger.captureException(error, {
  userId: "123",
  action: "purchase",
  amount: 99.99,
});

// Capture custom messages
logger.captureMessage("Custom event occurred", "info", {
  feature: "analytics",
  version: "2.0",
});
```

### Context Management

```typescript
import { setUser, setTag, setExtra, addBreadcrumb } from "@pilab/log";

// Set user information
setUser({
  id: "12345",
  email: "user@example.com",
  username: "johndoe",
});

// Add tags for filtering
setTag("component", "checkout");
setTag("version", "1.2.3");

// Add extra context
setExtra("sessionId", "abc-123");
setExtra("experiments", ["feature-a", "feature-b"]);

// Manual breadcrumbs
addBreadcrumb({
  type: "user",
  category: "action",
  message: "User clicked purchase button",
  data: { productId: "456", price: 29.99 },
});
```

### Scoped Context

```typescript
import { withScope } from "@pilab/log";

// Temporary context that doesn't affect global scope
withScope((scope) => {
  scope.setTag("feature", "checkout");
  scope.setLevel("error");
  scope.setExtra("checkoutStep", "payment");

  captureMessage("Checkout process failed");
  // Tags and extras only apply to this message
});
```

### Performance Monitoring

```typescript
import { logger } from "@pilab/log";

// Track transactions
const transaction = logger.startTransaction("page_load");

// Track specific operations
const apiSpan = transaction.startSpan("api_call");
// ... make API call
apiSpan.finish();

const renderSpan = transaction.startSpan("render_page");
// ... render page
renderSpan.finish();

transaction.finish(); // Logs complete transaction timing
```

### Advanced Configuration

```typescript
init({
  dsn: "https://your-endpoint.com/api/logs",
  environment: "production",

  // Filtering and processing
  beforeSend: (logMessage) => {
    // Filter sensitive information
    if (logMessage.message.includes("password")) {
      return null; // Don't send this log
    }

    // Modify logs before sending
    logMessage.tags = { ...logMessage.tags, filtered: "true" };
    return logMessage;
  },

  beforeBreadcrumb: (breadcrumb) => {
    // Filter breadcrumbs
    if (breadcrumb.category === "console") {
      return null; // Don't capture console breadcrumbs
    }
    return breadcrumb;
  },

  // Error filtering
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    /^Non-Error promise rejection/,
  ],

  // Default context
  defaultTags: {
    version: "1.0.0",
    component: "frontend",
  },

  defaultContext: {
    buildNumber: "12345",
    deploymentId: "prod-456",
  },

  // Performance settings
  maxMessageLength: 8192,
  sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
  autoSessionTracking: true,
});
```

## 🔧 Built-in Integrations

### Global Error Handling

Automatically captures:

- Unhandled JavaScript errors
- Unhandled promise rejections
- Network request failures

### Automatic Breadcrumbs

Tracks user journey with:

- 🖱️ **UI Interactions** - Clicks, form submissions
- 🌐 **Navigation** - Page changes, route transitions
- 🔗 **HTTP Requests** - Fetch/XHR calls with timing
- 💬 **Console Logs** - Debug information
- ⚠️ **Errors** - All error occurrences

### Browser Context

Automatically collects:

- Browser information
- Device specifications
- Screen resolution
- Timezone and language
- Current URL and referrer

## 🎨 Development Experience

### Beautiful Console Output

The logger provides rich console output in development:

```
🔍 [DEBUG] 14:30:15: User interaction detected
  📋 Context: { userId: "123", action: "click" }
  🏷️ Tags: { component: "button", version: "1.0" }
  👤 User: { id: "123", email: "user@example.com" }
  🍞 Breadcrumbs: [...last 5 breadcrumbs...]
  🔐 Session: 1234567890-abc123
```

### Environment Detection

```typescript
// Automatically enables appropriate settings based on environment
const config = {
  development: {
    debug: true,
    enableConsoleLogging: true,
    sampleRate: 1.0,
  },
  production: {
    debug: false,
    enableConsoleLogging: false,
    sampleRate: 0.1,
  },
};
```

## 🏗️ Custom Integrations

Create your own integrations:

```typescript
import { LoggerIntegration, Logger } from "@pilab/log";

class CustomIntegration implements LoggerIntegration {
  name = "CustomIntegration";

  setupOnce(): void {
    // Your custom instrumentation
    window.addEventListener("customEvent", (event) => {
      Logger.getInstance().addBreadcrumb({
        type: "user",
        category: "custom",
        message: "Custom event occurred",
        data: event.detail,
      });
    });
  }
}

// Use your integration
init({
  integrations: [new CustomIntegration()],
  // ... other config
});
```

## 📊 Server Integration Examples

### Express.js Endpoint

```javascript
app.post("/api/logs", express.json(), (req, res) => {
  const logData = req.body;

  // Process the log data
  console.log("Received log:", {
    level: logData.level,
    message: logData.message,
    user: logData.user,
    timestamp: logData.timestamp,
    environment: logData.environment,
    session: logData.session,
  });

  // Store in your database/logging service
  // await saveToDatabase(logData);

  res.status(200).json({ success: true });
});
```

### Next.js API Route

```typescript
// pages/api/logs.ts
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const logData = req.body;

  // Process log data
  console.log("Frontend log received:", logData);

  // Forward to your logging service
  // await forwardToLoggingService(logData);

  res.status(200).json({ success: true });
}
```

## 🔒 Privacy & Security

- **PII Protection**: Configurable PII filtering
- **Data Sanitization**: Built-in sensitive data removal
- **Transport Security**: HTTPS enforcement
- **Sampling**: Reduce data volume in production
- **Local Development**: Full logging without external requests

## 🎯 Best Practices

### 1. Environment Configuration

```typescript
const config = {
  development: {
    enableConsoleLogging: true,
    debug: true,
    sampleRate: 1.0,
  },
  production: {
    enableConsoleLogging: false,
    debug: false,
    sampleRate: 0.1,
    beforeSend: (log) => sanitizeSensitiveData(log),
  },
};

init(config[process.env.NODE_ENV]);
```

### 2. Structured Logging

```typescript
// ❌ Don't do this
logger.info("User John logged in");

// ✅ Do this instead
logger.info("User login successful", {
  userId: user.id,
  loginMethod: "oauth",
  timestamp: Date.now(),
});
```

### 3. Error Context

```typescript
try {
  await processPayment(amount);
} catch (error) {
  logger.captureException(error, {
    userId: user.id,
    amount,
    paymentMethod: "credit_card",
    step: "payment_processing",
  });
}
```

## 📈 Performance

- **Lazy Loading**: Integrations loaded on demand
- **Efficient Sampling**: Configurable event sampling
- **Minimal Bundle**: Tree-shakeable with small footprint
- **Async Processing**: Non-blocking log transmission
- **Debounced Breadcrumbs**: Prevents spam from rapid events

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Sentry](https://sentry.io/) for error tracking patterns
- Built with modern TypeScript and web standards
- Community feedback and contributions

## 📞 Support

- 📖 **Documentation**: [Full API docs](https://docs.pilab.hu/pilab-dev/log)
- 🐛 **Issues**: [GitHub Issues](https://github.com/pilab-dev/log/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/pilab-dev/log/discussions)
- 📧 **Email**: gyula@pilab.hu

---

<div align="center">

**Made with ❤️ for developers who care about logging**

[⭐ Star this repo](https://github.com/pilab-dev/log) |
[🐛 Report Bug](https://github.com/pilab-dev/log) |
[💡 Request Feature](https://github.com/pilab-dev/log)

</div>
