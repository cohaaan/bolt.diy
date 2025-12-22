import React, { memo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { Switch } from '~/components/ui/Switch';
import { classNames } from '~/utils/classNames';
import { toast } from 'react-toastify';
import { testStateStore, type TestConfig } from '~/lib/stores/testState';
import { autoTestRunner } from '~/lib/services/autoTestRunner';

const SettingRow = memo(
  ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children: React.ReactNode;
  }) => (
    <div className="flex items-center justify-between py-3 border-b border-bolt-elements-borderColor last:border-b-0">
      <div>
        <h4 className="text-sm font-medium text-bolt-elements-textPrimary">{title}</h4>
        <p className="text-xs text-bolt-elements-textSecondary mt-0.5">{description}</p>
      </div>
      <div>{children}</div>
    </div>
  ),
);

const NumberInput = memo(
  ({
    value,
    onChange,
    min,
    max,
    step,
    suffix,
  }: {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
  }) => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className={classNames(
          'w-20 px-2 py-1 text-sm text-right rounded',
          'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
          'text-bolt-elements-textPrimary',
          'focus:outline-none focus:ring-2 focus:ring-purple-500/30',
        )}
      />
      {suffix && <span className="text-xs text-bolt-elements-textSecondary">{suffix}</span>}
    </div>
  ),
);

export default function TestingTab() {
  const config = useStore(testStateStore.config);
  const currentTest = useStore(testStateStore.currentTest);
  const isRunning = useStore(testStateStore.isRunning);

  const updateConfig = useCallback((key: keyof TestConfig, value: boolean | number) => {
    testStateStore.updateConfig({ [key]: value });
    toast.success(`Testing setting updated`);
  }, []);

  const handleManualTest = useCallback(async () => {
    toast.info('Starting manual test...');
    await autoTestRunner.manualTest();
  }, []);

  const handleClearHistory = useCallback(() => {
    testStateStore.clearHistory();
    toast.success('Test history cleared');
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <motion.div
        className="flex items-center gap-3"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="i-ph:test-tube text-2xl text-purple-500" />
        <div>
          <h2 className="text-lg font-medium text-bolt-elements-textPrimary">Automated Testing</h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            Configure automatic testing of generated code
          </p>
        </div>
      </motion.div>

      {/* Current Status */}
      {currentTest && (
        <motion.div
          className={classNames(
            'p-4 rounded-lg',
            currentTest.status === 'passed' && 'bg-green-500/10 border border-green-500/30',
            currentTest.status === 'failed' && 'bg-red-500/10 border border-red-500/30',
            currentTest.status === 'running' && 'bg-blue-500/10 border border-blue-500/30',
            currentTest.status === 'pending' && 'bg-gray-500/10 border border-gray-500/30',
            currentTest.status === 'stuck' && 'bg-orange-500/10 border border-orange-500/30',
          )}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentTest.status === 'running' && (
                <div className="i-ph:circle-notch animate-spin text-blue-500" />
              )}
              {currentTest.status === 'passed' && <div className="i-ph:check-circle text-green-500" />}
              {currentTest.status === 'failed' && <div className="i-ph:x-circle text-red-500" />}
              {currentTest.status === 'stuck' && <div className="i-ph:warning text-orange-500" />}
              <span className="text-sm font-medium text-bolt-elements-textPrimary capitalize">
                {currentTest.status}
              </span>
            </div>
            {currentTest.duration && (
              <span className="text-xs text-bolt-elements-textSecondary">
                {currentTest.duration}ms
              </span>
            )}
          </div>
          {currentTest.errors.length > 0 && (
            <div className="mt-2 text-xs text-bolt-elements-textSecondary">
              {currentTest.errors.length} error(s) detected
            </div>
          )}
          {currentTest.retryCount > 0 && (
            <div className="mt-1 text-xs text-bolt-elements-textSecondary">
              Retry attempt: {currentTest.retryCount}/{config.maxRetries}
            </div>
          )}
        </motion.div>
      )}

      {/* Settings */}
      <motion.div
        className="bg-bolt-elements-background-depth-2 rounded-lg p-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">Settings</h3>

        <SettingRow
          title="Auto-Test Enabled"
          description="Automatically test code after each build"
        >
          <Switch
            checked={config.autoTestEnabled}
            onCheckedChange={(checked) => updateConfig('autoTestEnabled', checked)}
          />
        </SettingRow>

        <SettingRow
          title="Wait Before Test"
          description="Time to wait after artifact completion before testing"
        >
          <NumberInput
            value={config.waitBeforeTest / 1000}
            onChange={(v) => updateConfig('waitBeforeTest', v * 1000)}
            min={1}
            max={30}
            step={1}
            suffix="sec"
          />
        </SettingRow>

        <SettingRow
          title="Test Timeout"
          description="Maximum time to wait for page load"
        >
          <NumberInput
            value={config.testTimeout / 1000}
            onChange={(v) => updateConfig('testTimeout', v * 1000)}
            min={5}
            max={120}
            step={5}
            suffix="sec"
          />
        </SettingRow>

        <SettingRow
          title="Max Retries"
          description="Maximum fix attempts before marking as stuck"
        >
          <NumberInput
            value={config.maxRetries}
            onChange={(v) => updateConfig('maxRetries', v)}
            min={1}
            max={10}
            step={1}
          />
        </SettingRow>

        <SettingRow
          title="Screenshot on Fail"
          description="Capture screenshot when tests fail"
        >
          <Switch
            checked={config.screenshotOnFail}
            onCheckedChange={(checked) => updateConfig('screenshotOnFail', checked)}
          />
        </SettingRow>

        <SettingRow
          title="Screenshot on Pass"
          description="Capture screenshot when tests pass"
        >
          <Switch
            checked={config.screenshotOnPass}
            onCheckedChange={(checked) => updateConfig('screenshotOnPass', checked)}
          />
        </SettingRow>
      </motion.div>

      {/* Actions */}
      <motion.div
        className="flex gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          onClick={handleManualTest}
          disabled={isRunning}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-purple-500 text-white',
            'hover:bg-purple-600 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          {isRunning ? (
            <>
              <div className="i-ph:circle-notch animate-spin" />
              Running...
            </>
          ) : (
            <>
              <div className="i-ph:play" />
              Run Manual Test
            </>
          )}
        </button>

        <button
          onClick={handleClearHistory}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
            'bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
            'hover:bg-bolt-elements-background-depth-4 transition-colors',
          )}
        >
          <div className="i-ph:trash" />
          Clear History
        </button>
      </motion.div>
    </div>
  );
}
