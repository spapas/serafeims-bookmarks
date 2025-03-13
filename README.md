# Code Bookmarks

A VS Code extension for bookmarking code lines and quickly navigating between them.

## Features

- Bookmark lines of code throughout your project
- Bookmarks are saved as (filename, line content) tuples
- View bookmarks in a dedicated sidebar
- Current file's bookmarks are displayed separately at the top
- Filter bookmarks with a search box
- Navigate to bookmarked locations with a single click
- Bookmarks persist across VS Code sessions

## Usage

### Adding a Bookmark

1. Place your cursor on a line you want to bookmark
2. Press `Ctrl+Shift+B` (`Cmd+Shift+B` on Mac)
3. Alternatively, right-click and select "Add Code Bookmark" from the context menu

### Removing a Bookmark

1. Place your cursor on a bookmarked line
2. Right-click and select "Remove Code Bookmark" from the context menu
3. Alternatively, click the delete icon next to a bookmark in the sidebar

### Navigating to Bookmarks

1. Open the Code Bookmarks sidebar (click the bookmark icon in the Activity Bar)
2. Click on any bookmark to jump to its location

### Filtering Bookmarks

1. Use the search box at the top of the bookmarks view
2. Enter text to filter by filename or line content
3. Clear the search box to show all bookmarks

## How It Works

Bookmarks are stored as tuples of (filename, line content) and saved to your project workspace. The extension checks the content of each file to find bookmarks, making it robust even when line numbers change.

## Extension Settings

* `codeBookmarks.addBookmark`: Add a bookmark at the current cursor position
* `codeBookmarks.removeBookmark`: Remove a bookmark at the current cursor position
* `codeBookmarks.clearAllBookmarks`: Remove all bookmarks from the workspace

## Building and Installing

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run package` to build the extension
4. Install the extension by copying the .vsix file to your VS Code extensions folder or using the "Install from VSIX" command

## License

This project is licensed under the MIT License.