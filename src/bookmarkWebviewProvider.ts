import * as vscode from 'vscode';

export class BookmarkWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codeBookmarksSearch';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly onSearch: (pattern: string) => void
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'search':
          this.onSearch(data.value);
          break;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bookmark Search</title>
        <style>
          body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
          }
          .search-container {
            padding: 8px;
            display: flex;
          }
          input {
            flex: 1;
            padding: 4px 8px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
          }
          button {
            margin-left: 4px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <div class="search-container">
          <input type="text" id="search-input" placeholder="Filter bookmarks..." />
          <button id="clear-button">Clear</button>
        </div>
        
        <script>
          const vscode = acquireVsCodeApi();
          const searchInput = document.getElementById('search-input');
          const clearButton = document.getElementById('clear-button');
          
          searchInput.addEventListener('input', () => {
            vscode.postMessage({
              type: 'search',
              value: searchInput.value
            });
          });
          
          clearButton.addEventListener('click', () => {
            searchInput.value = '';
            vscode.postMessage({
              type: 'search',
              value: ''
            });
          });
        </script>
      </body>
      </html>`;
  }
}