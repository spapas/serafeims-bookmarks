import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
//import { BookmarkWebviewProvider } from './bookmarkWebviewProvider';

interface Bookmark {
  filename: string;
  lineContent: string;
}



function getRelativePath(document: vscode.TextDocument): string {
  // Get the absolute path of the file
  const absolutePath: string = document.fileName;

  // Get workspace folders
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    return absolutePath; // No workspace is open
  }

  // Try to find the workspace folder that contains this file
  for (const folder of workspaceFolders) {
    const folderPath: string = folder.uri.fsPath;

    if (absolutePath.startsWith(folderPath)) {
      // Convert to relative path
      return path.relative(folderPath, absolutePath);
    }
  }

  // File is not in any workspace folder
  return absolutePath;
}

function getAbsolutePath(relativePath: string): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null; // No workspace is open
  }

  // By default, use the first workspace folder
  // You might need more logic if you're dealing with multi-root workspaces
  const rootPath: string = workspaceFolders[0].uri.fsPath;

  // Combine root path with relative path
  return path.join(rootPath, relativePath);
}


export class BookmarkProvider implements vscode.TreeDataProvider<BookmarkItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<BookmarkItem | undefined | null | void> = new vscode.EventEmitter<BookmarkItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<BookmarkItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private bookmarks: Bookmark[] = [];
  private searchPattern: string = '';

  constructor(private context: vscode.ExtensionContext) {
    // Load existing bookmarks 
    const bookmarksFilePath = this.getBookmarksFilePath();
    this.bookmarks = JSON.parse(fs.readFileSync(
      bookmarksFilePath,
      'utf8'
    ));
  }

  getBookmarks(): Bookmark[] {
    return this.bookmarks;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BookmarkItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: BookmarkItem): Thenable<BookmarkItem[]> {
    // If element is provided, it's a request for children of a specific node
    if (element) {
      // Check if this is a category header (has no bookmark property)
      if (!element.bookmark) {
        const activeEditor = vscode.window.activeTextEditor;
        const filteredBookmarks = this.filterBookmarks(this.bookmarks);
        const currentFilename = activeEditor ? getRelativePath(activeEditor.document) : null;
        
        // Return children based on the header type
        if (element.label === 'Current File') {
          return Promise.resolve(this.convertToTreeItems(
            filteredBookmarks.filter(b => b.filename === currentFilename)
          ));
        } else if (element.label === 'Other Files') {
          return Promise.resolve(this.convertToTreeItems(
            filteredBookmarks.filter(b => b.filename !== currentFilename)
          ));
        } else if (element.label === 'All Bookmarks') {
          return Promise.resolve(this.convertToTreeItems(filteredBookmarks));
        }
      }
      // Regular bookmark items have no children
      return Promise.resolve([]);
    }
    
    // Root level - only return the category headers
    const activeEditor = vscode.window.activeTextEditor;
    const filteredBookmarks = this.filterBookmarks(this.bookmarks);
    const items: BookmarkItem[] = [];
    
    if (activeEditor) {
      const currentFilename = getRelativePath(activeEditor.document);
      const currentFileBookmarks = filteredBookmarks.filter(b => b.filename === currentFilename);
      const otherFileBookmarks = filteredBookmarks.filter(b => b.filename !== currentFilename);
      
      if (currentFileBookmarks.length > 0) {
        items.push(new BookmarkItem(
          'Current File',
          vscode.TreeItemCollapsibleState.Expanded,
          undefined // No bookmark here indicates it's a header
        ));
      }
      
      if (otherFileBookmarks.length > 0) {
        items.push(new BookmarkItem(
          'Other Files',
          vscode.TreeItemCollapsibleState.Expanded,
          undefined // No bookmark here indicates it's a header
        ));
      }
    } else {
      // No active editor, just show all bookmarks under one header
      if (filteredBookmarks.length > 0) {
        items.push(new BookmarkItem(
          'All Bookmarks',
          vscode.TreeItemCollapsibleState.Expanded,
          undefined // No bookmark here indicates it's a header
        ));
      }
    }
    
    return Promise.resolve(items);
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
        `${filename}: ${bookmark.lineContent}`,
        bookmark
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
    const filename = getRelativePath(document);

    // Check if this line is already bookmarked
    const existingIndex = this.bookmarks.findIndex(b =>
      b.filename === filename && b.lineContent === lineContent
    );

    if (existingIndex >= 0) {
      vscode.window.showInformationMessage('This line is already bookmarked.');
      return;
    }

    this.bookmarks.push({
      filename,
      lineContent
    });

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
      const lineContent = editor.document.lineAt(lineNumber).text.trim();
      const filename = editor.document.fileName;

      const index = this.bookmarks.findIndex(b =>
        b.filename === filename && b.lineContent === lineContent
      );

      if (index >= 0) {
        this.bookmarks.splice(index, 1);
        await this.saveBookmarks();
        this.refresh();
        vscode.window.showInformationMessage('Bookmark removed.');
      } else {
        vscode.window.showInformationMessage(`No bookmark found with text ${lineContent}.`);
      }
    } else {
      const index = this.bookmarks.findIndex(b =>
        b.filename === bookmark.filename && b.lineContent === bookmark.lineContent
      );

      if (index >= 0) {
        this.bookmarks.splice(index, 1);
        await this.saveBookmarks();
        this.refresh();
        vscode.window.showInformationMessage('Bookmark removed.');
      } else {
        vscode.window.showInformationMessage('No bookmark found to remove.');
      }
    }
  }

  async clearAllBookmarks(): Promise<void> {
    this.bookmarks = [];
    await this.saveBookmarks();
    this.refresh();
    vscode.window.showInformationMessage('All bookmarks cleared.');
  }

  private getBookmarksFilePath(): string {
    const vscode = require('vscode');
    const fs = require('fs');
    const path = require('path');

    // Get the workspace folder path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const vscodeFolder = path.join(workspacePath, '.vscode');

      if (!fs.existsSync(vscodeFolder)) {
        fs.mkdirSync(vscodeFolder);
      }

      return path.join(vscodeFolder, 'serafeims-bookmarks.json');
    }
    throw new Error('No workspace folder found.');
  }

  private async saveBookmarks(): Promise<void> {
    const vscode = require('vscode');
    const fs = require('fs');
    const path = require('path');

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const workspacePath = workspaceFolders[0].uri.fsPath;
      const vscodeFolder = path.join(workspacePath, '.vscode');

      if (!fs.existsSync(vscodeFolder)) {
        fs.mkdirSync(vscodeFolder);
      }

      const bookmarksFilePath = await this.getBookmarksFilePath();

      fs.writeFileSync(
        bookmarksFilePath,
        JSON.stringify(this.bookmarks, null, 2),
        'utf8'
      );

      console.log('Bookmarks saved successfully');

    }
  }

  async openBookmark(bookmark: Bookmark): Promise<void> {
    try {
      const filename = getAbsolutePath(bookmark.filename);
      if (filename == null || !fs.existsSync(filename)) {
        vscode.window.showErrorMessage(`File not found: ${bookmark.filename}`);
        return;
      }

      const document = await vscode.workspace.openTextDocument(filename);
      const editor = await vscode.window.showTextDocument(document);

      // Validate line number is in range
      const lineCount = editor.document.lineCount;
      let lineNumber = null; //onst lineNumber = Math.min(bookmark.lineNumber, lineCount - 1);



      // Reveal the line in editor
      //editor.revealRange(
      //new vscode.Range(lineNumber, 0, lineNumber, 0),
      //vscode.TextEditorRevealType.InCenter
      //);

      for (let i = 0; i < lineCount; i++) {
        const lineContent = document.lineAt(i).text.trim();
        if (lineContent === bookmark.lineContent) {
          lineNumber = i;
          break;
        }
      }
      if (!lineNumber) {
        vscode.window.showErrorMessage(`Bookmark line not found: ${bookmark.lineContent}`);
        return;
      }

      // Create a selection at the bookmarked line
      const position = new vscode.Position(lineNumber, 0);
      editor.selection = new vscode.Selection(position, position);


      // Highlight the line temporarily
      const lineRange = new vscode.Range(lineNumber, 0, lineNumber, Number.MAX_VALUE);

      // Create a decoration type
      const highlightDecorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
        borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
        isWholeLine: true
      });

      // Apply the decoration
      editor.setDecorations(highlightDecorationType, [lineRange]);

      // Reveal the line in editor
      editor.revealRange(
        new vscode.Range(lineNumber, 0, lineNumber, 0),
        vscode.TextEditorRevealType.InCenter
      );

      // Remove the decoration after a delay (e.g., 1.5 seconds)
      setTimeout(() => {
        highlightDecorationType.dispose();
      }, 1500);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open bookmark: ${error}`);
    }
  }

  // Find bookmarks by content
  findBookmarksByContent(content: string): Bookmark[] {
    return this.bookmarks.filter(b => b.lineContent.includes(content));
  }

}

class BookmarkItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly isSection: boolean = false,
    public readonly description?: string,
    public readonly bookmark?: Bookmark
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


class BookmarkQPItem implements vscode.QuickPickItem {
  label: string;
  bookmark: Bookmark; 

  constructor(label: string, bookmark: Bookmark) {
    this.label = label;
    this.bookmark = bookmark;
  }
}


export function activate(context: vscode.ExtensionContext) {
  console.log('Code Bookmarks extension is now active');

  // Initialize the bookmark provider
  const bookmarkProvider = new BookmarkProvider(context);

  // Register the tree data provider
  const treeView = vscode.window.createTreeView('codeBookmarksView', {
    treeDataProvider: bookmarkProvider,
    showCollapseAll: true,
  });


  // Add bookmark from current editor
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.addBookmark', () => {
      bookmarkProvider.addBookmark();
    })
  );

  // Remove bookmark
  context.subscriptions.push(
    vscode.commands.registerCommand('codeBookmarks.removeBookmark', (bookmarkItem) => {

      bookmarkProvider.removeBookmark(bookmarkItem.bookmark);
      vscode.window.showInformationMessage(`Bookmark '${bookmarkItem.label}' removed.`);
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

  // Update view when active editor changes
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      bookmarkProvider.refresh();
    })
  );

  context.subscriptions.push(treeView);

  //////////
  const qpDisposable = vscode.commands.registerCommand('codeBookmarks.showCustomQuickPick', async () => {
    const quickPick = vscode.window.createQuickPick<BookmarkQPItem>();
    quickPick.items = bookmarkProvider.getBookmarks().map(b => new BookmarkQPItem(
      b.lineContent,
      b
    ));
    quickPick.placeholder = 'Search bookmarks...';
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;

    // Handle selection
    quickPick.onDidAccept(() => {
      const selection = quickPick.selectedItems[0];
      if (selection) {
        // Handle the selected item
        vscode.window.showInformationMessage(`Selected: ${selection.label}`);

        // Do something with selection.data
        console.log('Selected item data:', selection.bookmark);
        bookmarkProvider.openBookmark(selection.bookmark);

      }
      quickPick.hide();
    });

    // Handle cancellation
    quickPick.onDidHide(() => quickPick.dispose());

    // Show the quick pick
    quickPick.show();
  });

  context.subscriptions.push(qpDisposable);

}

export function deactivate() { }