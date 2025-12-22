import express from 'express';

const app = express();

app.use(express.json());

// In-memory test state (would be replaced by TestStateStore in full integration)
const testState = {
  tests: new Map(),
  createTest(artifactId) {
    const id = `test-${Date.now()}-${artifactId || 'manual'}`;
    const test = {
      id,
      artifactId,
      status: 'pending',
      errors: [],
      timestamp: Date.now(),
    };
    this.tests.set(id, test);
    return test;
  },
  getTest(id) {
    return this.tests.get(id);
  },
  updateTest(id, updates) {
    const test = this.tests.get(id);
    if (test) {
      Object.assign(test, updates);
    }
    return test;
  },
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Testing API endpoints
app.post('/api/test/run', async (req, res) => {
  try {
    const { previewUrl, options = {} } = req.body;
    
    if (!previewUrl) {
      return res.status(400).json({ error: 'previewUrl is required' });
    }

    const test = testState.createTest(options.artifactId);
    testState.updateTest(test.id, { status: 'running' });

    // Try to run Puppeteer tests
    try {
      const puppeteer = await import('puppeteer');
      const startTime = Date.now();
      const errors = [];
      const consoleMessages = [];

      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });

      // Capture console errors
      page.on('console', (msg) => {
        consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
        if (msg.type() === 'error') {
          errors.push({ type: 'console', message: msg.text(), timestamp: Date.now() });
        }
      });

      page.on('pageerror', (error) => {
        errors.push({ type: 'render', message: error.message, stack: error.stack, timestamp: Date.now() });
      });

      page.on('requestfailed', (request) => {
        const failure = request.failure();
        errors.push({ 
          type: 'network', 
          message: `${request.url()}: ${failure?.errorText || 'Unknown'}`, 
          timestamp: Date.now() 
        });
      });

      // Navigate
      await page.goto(previewUrl, { 
        waitUntil: 'networkidle0', 
        timeout: options.timeout || 30000 
      });

      // Capture screenshot
      let screenshot;
      if (errors.length > 0 || options.captureScreenshot) {
        screenshot = await page.screenshot({ encoding: 'base64' });
      }

      await browser.close();

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      testState.updateTest(test.id, {
        status: success ? 'passed' : 'failed',
        errors,
        screenshot,
        duration,
      });

      res.json({
        success,
        testId: test.id,
        result: {
          success,
          errors,
          screenshot,
          duration,
          consoleMessages,
        },
      });
    } catch (puppeteerError) {
      // Puppeteer not available or failed
      testState.updateTest(test.id, {
        status: 'failed',
        errors: [{ type: 'render', message: puppeteerError.message, timestamp: Date.now() }],
      });

      res.json({
        success: false,
        testId: test.id,
        result: {
          success: false,
          errors: [{ type: 'render', message: puppeteerError.message, timestamp: Date.now() }],
          duration: 0,
          consoleMessages: [],
        },
        note: 'Puppeteer execution failed - may not be available in this environment',
      });
    }
  } catch (error) {
    res.status(500).json({ 
      error: 'Test execution failed', 
      details: error instanceof Error ? error.message : String(error) 
    });
  }
});

app.get('/api/test/status/:id', (req, res) => {
  const { id } = req.params;
  const test = testState.getTest(id);
  
  if (!test) {
    return res.status(404).json({ error: 'Test not found', id });
  }
  
  res.json({
    id: test.id,
    status: test.status,
    artifactId: test.artifactId,
    timestamp: test.timestamp,
  });
});

app.get('/api/test/results/:id', (req, res) => {
  const { id } = req.params;
  const test = testState.getTest(id);
  
  if (!test) {
    return res.status(404).json({ error: 'Test not found', id });
  }
  
  res.json({
    id: test.id,
    status: test.status,
    errors: test.errors,
    screenshot: test.screenshot,
    duration: test.duration,
    timestamp: test.timestamp,
  });
});

// For Railway production: proxy to the main Remix app or serve static files
// This will be expanded when we integrate with the full Remix build
app.get('/', (req, res) => {
  res.json({
    name: 'bolt.diy Test API Server',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      testRun: 'POST /api/test/run',
      testStatus: 'GET /api/test/status/:id',
      testResults: 'GET /api/test/results/:id',
    },
  });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 Test API Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🧪 Test API: http://localhost:${PORT}/api/test/run`);
});
