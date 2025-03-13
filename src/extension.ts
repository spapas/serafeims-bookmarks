import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BookmarkWebviewProvider } from './bookmarkWebviewProvider';

interface Bookmark {
  filename: string;
  lineContent: string;
  lineNumber: number;
}

export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookmarkItem | undefined | null | void> = new vscode.EventEmitter<BookmarkItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BookmarkItem | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private bookmarks: Bookmark[] = [];
  private searchPattern: string = '';

  constructor(private context: vscode.ExtensionContext) {
    // Load existing bookmarks from workspace state
    this.bookmarks = context.workspaceState.get('bookmarks', []);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setSearchPattern(pattern: string): void {
    this.searchPattern = pattern;
    this.refresh();
  }

  getTreeItem(element: BookmarkItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BookmarkItem): Thenable<BookmarkItem[]> {
    if (!element) {
      const activeEditor = vscode.window.activeTextEditor;
      const filteredBookmarks = this.filterBookmarks(this.bookmarks);
      
      if (!activeEditor) {
        return Promise.resolve(this.convertToTreeItems(filteredBookmarks));
      }
      
      const currentFilename = activeEditor.document.fileName;
      
      // Split bookmarks into current file and other files
      const currentFileBookmarks = filteredBookmarks.filter(b => b.filename === currentFilename);
      const otherFileBookmarks = filteredBookmarks.filter(b => b.filename !== currentFilename);
      
      // Create section headers and their children
      const items: BookmarkItem[] = [];
      
      if (currentFileBookmarks.length > 0) {
        items.push(new BookmarkItem(
          'Current File',
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true
        ));
        
        items.push(...this.convertToTreeItems(currentFileBookmarks));
      }
      
      if (otherFileBookmarks.length > 0) {
        items.push(new BookmarkItem(
          'Other Files',
          vscode.TreeItemCollapsibleState.Expanded,
          undefined,
          true
        ));
        
        items.push(...this.convertToTreeItems(otherFileBookmarks));
      }
      
      return Promise.resolve(items);
    }
    
    return Promise.resolve([]);
  }

  private filterBookmarks(bookmarks: Bookmark[]): Bookmark[] {
    if (!this.searchPattern) {
      return bookmarks;
    }
    
    return bookmarks.filter(b => 
      b.lineContent.toLowerCase().includes(this.searchPattern.toLowerCase()) ||
      path.basename(b.filename).toLowerCase().includes(this.searchPattern.toLowerCase())
    );
  }

  private convertToTreeItems(bookmarks: Bookmark[]): BookmarkItem[] {
    return bookmarks.map(bookmark => {
      const filename = path.basename(bookmark.filename);
      return new BookmarkItem(
        bookmark.lineContent,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'codeBookmarks.openBookmark',
          title: 'Open Bookmark',
          arguments: [bookmark]
        },
        false,
        `${filename}:${bookmark.lineNumber + 1}`
      );
    });
  }

  async addBookmark(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor to add bookmark from.');
      return;
    }

    const selection = editor.selection;
    const lineNumber = selection.active.line;
    const document = editor.document;
    const lineContent = document.lineAt(lineNumber).text.trim();
    const filename = document.fileName;

    // Check if this line is already bookmarked
    const existingIndex = this.bookmarks.findIndex(b => 
      b.filename === filename && b.lineNumber === lineNumber
    );

    if (existingIndex >= 0) {
      vscode.window.showInformationMessage('This line is already bookmarked.');
      return;
    }

    // Add new bookmark
    this.bookmarks.push({
      filename,
      lineContent,
      lineNumber
    });

    // Save to workspace state
    await this.saveBookmarks();
    this.refresh();
    
    vscode.window.showInformationMessage(`Bookmarked: ${lineContent}`);
  }

  async removeBookmark(bookmark?: Bookmark): Promise<void> {
    if (!bookmark) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage('No active editor to remove bookmark from.');
        return;
      }

      const lineNumber = editor.selection.active.line;
      const filename = editor.document.fileName;

      const index = this.bookmarks.findIndex(b => 
        b.filename === filename && b.lineNumber === lineNumber
      );

      if (index >= 0) {
        this.bookmarks.splice(index, 1);
        await this.saveBookmarks();
        this.refresh();
        vscode.window.showInformationMessage('Bookmark removed.');
      } else {
        vscode.window.showInformationMessage('No bookmark found at current position.');
      }
    } else {
      const index = this.bookmarks.findIndex(b => 
        b.filename === bookmark.filename && b.lineNumber === bookmark.lineNumber
      );

      if (index >= 0) {
        this.bookmarks.splice(index, 1);
        await this.saveBookmarks();
        this.refresh();
        vscode.window.showInformationMessage('Bookmark removed.');
      }
    }
  }

  async clearAllBookmarks(): Promise<void> {
    this.bookmarks = [];
    await this.saveBookmarks();
    this.refresh();
    vscode.window.showInformationMessage('All bookmarks cleared.');
  }

  private async saveBookmarks(): Promise<void> {
    await this.context.workspaceState.update('bookmarks', this.bookmarks);
  }

  async openBookmark(bookmark: Bookmark): Promise<void> {
    try {
      // Check if file exists
      if (!fs.existsSync(bookmark.filename)) {
        vscode.window.showErrorMessage(`File not found: ${bookmark.filename}`);
        return;
      }

      const document = await vscode.workspace.openTextDocument(bookmark.filename);
      const editor = await vscode.window.showTextDocument(document);
      
      // Validate line number is in range
      const lineCount = editor.document.lineCount;
      const lineNumber = Math.min(bookmark.lineNumber, lineCount - 1);
      
      // Create a selection at the bookmarked line
      const position = new vscode.Position(lineNumber, 0);
      editor.selection = new vscode.Selection(position, position);
      
      // Reveal the line in editor
      editor.revealRange(
        new vscode.Range(lineNumber, 0, lineNumber, 0),
        vscode.TextEditorRevealType.InCenter
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open bookmark: ${error}`);
    }
  }

  // Find bookmarks by content
  findBookmarksByContent(content: string): Bookmark[] {
    return this.bookmarks.filter(b => b.lineContent.includes(content));
  }

  // Update bookmarks if file content changes
  async updateBookmarksFromFile(document: vscode.TextDocument): Promise<void> {
    const filename = document.fileName;
    const fileBookmarks = this.bookmarks.filter(b => b.filename === filename);
    let updated = false;

    for (const bookmark of fileBookmarks) {
      // Check if the line content still matches
      if (bookmark.lineNumber < document.lineCount) {
        const currentContent = document.lineAt(bookmark.lineNumber).text.trim();
        if (currentContent !== bookmark.lineContent) {
          // Try to find matching content in the file
          let found = false;
          for (let i = 0; i < document.lineCount; i++) {
            const lineContent = document.lineAt(i).text.trim();
            if (lineContent === bookmark.lineContent) {
              bookmark.lineNumber = i;
              found = true;
              updated = true;
              break;
            }
          }

          // If not found, leave it at the original line number
          if (!found) {
            // Update the content to match current line
            bookmark.lineContent = currentContent;
            updated = true;
          }
        }
      }
    }

    if (updated) {
      await this.saveBookmarks();
      this.refresh();
    }
  }
}

class BookmarkItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly isSection: boolean = false,
    public readonly description?: string
  ) {
    super(label, collapsibleState);
    
    if (!isSection) {
      this.iconPath = new vscode.ThemeIcon('bookmark');
      this.tooltip = `${description}: ${label}`;
    } else {
      this.tooltip = label;
      this.contextValue = 'section';
    }
    
    this.description = description;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Code Bookmarks extension is now active');

  // Initialize the bookmark provider
  const bookmarkProvider = new BookmarkProvider(context);
  
  // Register the tree data provider
  const treeView = vscode.window.createTreeView('codeBookmarksView', {
    treeDataProvider: bookmarkProvider,
    showCollapseAll: true
  });
  
  // Register the search webview provider
  const searchProvider = new BookmarkWebviewProvider(
    context.extensionUri,
    (pattern) => bookmarkProvider.setSearchPattern(pattern)
  );
  
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BookmarkWebviewProvider.viewType,
      searchProvider
    )
  );
  
  // Add bookmark from current editor
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.addBookmark', () => {
      bookmarkProvider.addBookmark();
    })
  );
  
  // Remove bookmark
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.removeBookmark', (bookmark) => {
      bookmarkProvider.removeBookmark(bookmark);
    })
  );
  
  // Clear all bookmarks
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.clearAllBookmarks', () => {
      bookmarkProvider.clearAllBookmarks();
    })
  );
  
  // Open bookmark
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.openBookmark', (bookmark) => {
      bookmarkProvider.openBookmark(bookmark);
    })
  );

  // Create a status bar item for filter
  const filterStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  filterStatusBarItem.text = "$(search) Filter Bookmarks";
  filterStatusBarItem.tooltip = "Filter bookmarks by text";
  filterStatusBarItem.command = 'codeBookmarks.filterBookmarks';
  filterStatusBarItem.show();
  
  // Filter bookmarks command
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.filterBookmarks', async () => {
      const pattern = await vscode.window.showInputBox({
        placeHolder: 'Enter text to filter bookmarks',
        prompt: 'Leave empty to show all bookmarks'
      });
      
      bookmarkProvider.setSearchPattern(pattern || '');
    })
  );
  
  // Update bookmarks when document changes
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      bookmarkProvider.updateBookmarksFromFile(document);
    })
  );
  
  // Update view when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      bookmarkProvider.refresh();
    })
  );
  
  context.subscriptions.push(treeView);
  context.subscriptions.push(filterStatusBarItem);
}

export function deactivate() {}