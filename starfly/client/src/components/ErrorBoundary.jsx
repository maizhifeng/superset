import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import AlertTriangleIcon from '@mui/icons-material/ReportProblem';
import RefreshIcon from '@mui/icons-material/Refresh';

const DEBUG_ENABLED = typeof localStorage !== 'undefined' &&
  (localStorage.getItem('debug_errors') === 'true' || process.env.NODE_ENV === 'development');

function extractUsefulProps(props) {
  const { children, fallback, onReset, ...rest } = props || {};
  const summary = {};
  for (const [key, val] of Object.entries(rest)) {
    if (typeof val === 'function') continue;
    if (React.isValidElement(val)) { summary[key] = `<${val.type?.displayName || val.type?.name || 'Component'}>`; continue; }
    if (Array.isArray(val)) { summary[key] = `Array(${val.length})`; continue; }
    if (val && typeof val === 'object') {
      try { summary[key] = JSON.stringify(val).slice(0, 200); } catch { summary[key] = '[Circular]'; }
      continue;
    }
    summary[key] = val;
  }
  return summary;
}

function buildLogPayload(error, props, errorInfo) {
  const lines = [];
  lines.push(`[ErrorBoundary] ${new Date().toISOString()}`);
  lines.push('');
  if (props?.widgetInfo) {
    lines.push(props.widgetInfo);
    lines.push('');
  }
  lines.push(`Error: ${error?.message || '(no message)'}`);
  lines.push(`Name: ${error?.name || 'Error'}`);
  if (error?.stack) lines.push(`\nStack:\n${error.stack}`);
  if (errorInfo?.componentStack) lines.push(`\nComponent stack:\n${errorInfo.componentStack}`);
  const propSummary = extractUsefulProps(props);
  const extraProps = Object.fromEntries(Object.entries(propSummary).filter(([k]) => k !== 'widgetInfo'));
  if (Object.keys(extraProps).length > 0) {
    lines.push(`\nProps:`);
    for (const [k, v] of Object.entries(extraProps)) lines.push(`  ${k}: ${v}`);
  }
  return lines.join('\n');
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, timestamp: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo, timestamp: new Date().toISOString() });

    if (!DEBUG_ENABLED) {
      console.error('[ErrorBoundary] Caught error:', error.message);
      if (this.props.context) console.warn(`[ErrorBoundary] in ${this.props.context}:`, error.message);
      console.warn('[ErrorBoundary] Set localStorage.debug_errors=true for detailed debug logs (component stack, props snapshot)');
      return;
    }

    console.group(`[ErrorBoundary] Rendering Error${this.props.context ? ` in ${this.props.context}` : ''} at ${new Date().toLocaleTimeString()}`);
    console.error('Error:', error);
    if (errorInfo?.componentStack) {
      const lines = errorInfo.componentStack.split('\n').filter(Boolean);
      console.error('Component stack:');
      lines.forEach(line => console.error(`  ${line.trim()}`));
    }
    console.error('Props snapshot:', extractUsefulProps(this.props));
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      const stackLines = error.stack.split('\n').slice(1, 6).filter(Boolean);
      console.error('Stack (top 5):');
      stackLines.forEach(line => console.error(`  ${line.trim()}`));
    }
    console.groupEnd();
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, timestamp: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      const { fallback, showDetails } = this.props;
      if (fallback) {
        return fallback({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          resetError: this.handleReset,
          timestamp: this.state.timestamp,
        });
      }

      return (
        <Paper sx={{ p: 2, m: 1, border: '1px solid', borderColor: 'error.main', borderRadius: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Box sx={{ width: 36, height: 36, bgcolor: 'error.light', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, mt: 0.5 }}>
              <AlertTriangleIcon sx={{ color: 'error.main', fontSize: 20 }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={600} sx={{ color: 'error.main', mb: 0.25 }}>
                {this.props.context || 'Widget'} error
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, wordBreak: 'break-word' }}>
                {this.state.error?.message || 'An error occurred while rendering.'}
              </Typography>
              {showDetails && this.state.error && (
                <Box
                  component="pre"
                  sx={{
                    bgcolor: 'action.hover', p: 1, borderRadius: 1,
                    fontSize: '0.6875rem', overflowX: 'auto', mb: 1,
                    fontFamily: (theme) => theme.typography.fontFamilyMono,
                  }}
                >
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack && (
                    <>{'\n\nComponent stack:\n'}{this.state.errorInfo.componentStack}</>
                  )}
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" onClick={this.handleReset} startIcon={<RefreshIcon />} sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.75rem' }}>
                  Retry
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    const payload = buildLogPayload(this.state.error, this.props, this.state.errorInfo);
                    navigator.clipboard?.writeText(payload);
                  }}
                  sx={{ textTransform: 'none', minHeight: 28, fontSize: '0.75rem' }}
                >
                  Copy debug log
                </Button>
              </Box>
            </Box>
          </Box>
        </Paper>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
