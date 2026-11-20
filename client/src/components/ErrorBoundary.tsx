import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function reportErrorToServer(error: Error, componentStack?: string) {
  try {
    fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
  }
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static isChunkLoadError(error: Error): boolean {
    return (
      error.name === "ChunkLoadError" ||
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("error loading dynamically imported module") ||
      error.message?.includes("Loading chunk") ||
      error.message?.includes("Importing a module script failed")
    );
  }

  static getDerivedStateFromError(error: Error): State {
    if (ErrorBoundary.isChunkLoadError(error)) {
      window.location.reload();
      return { hasError: false, error: null };
    }
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (ErrorBoundary.isChunkLoadError(error)) return;
    console.error("[ErrorBoundary] Uncaught error:", error, info.componentStack);
    reportErrorToServer(error, info.componentStack ?? undefined);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-foreground">
                Đã xảy ra lỗi không mong muốn
              </h1>
              <p className="text-muted-foreground text-sm">
                Trang này gặp sự cố. Vui lòng thử tải lại hoặc quay về trang chủ.
              </p>
            </div>

            {this.state.error && (
              <details className="text-left bg-muted rounded-lg p-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer font-medium mb-1">
                  Chi tiết lỗi (dành cho kỹ thuật)
                </summary>
                <pre className="whitespace-pre-wrap break-all mt-2">
                  {this.state.error.message}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
              >
                Tải lại trang
              </button>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Về trang chủ
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
