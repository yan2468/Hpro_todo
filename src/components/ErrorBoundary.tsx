import React from 'react';

interface State {
  error: Error | null;
}

/**
 * 兜底错误边界：任何渲染期异常都会被捕获并显示可读信息，
 * 避免「整棵树卸载 → #root 变空 → 白屏且无任何提示」的体验。
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 仅打印到控制台，便于通过开发者工具排查
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            color: '#333',
            maxWidth: 640,
            margin: '0 auto',
          }}
        >
          <h2 style={{ color: '#d33', marginTop: 40 }}>页面出错了</h2>
          <p style={{ lineHeight: 1.7, color: '#666' }}>
            应用渲染时发生了异常，已被错误边界捕获。你可以尝试刷新页面；
            若反复出现，请将下方错误信息反馈给开发者。
          </p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              background: '#f6f6f6',
              padding: 12,
              borderRadius: 8,
              fontSize: 12,
              color: '#b00',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {this.state.error.message}
            {this.state.error.stack ? '\n\n' + this.state.error.stack : ''}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
