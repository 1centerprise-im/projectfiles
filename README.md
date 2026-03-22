# My Mind Map Manager

A professional, modular mind map editor built as a pure static web app. Designed to run on GitHub Pages with no server or external JS libraries required.

## Features

- **Home Dashboard** - Browse organization folders and mind maps
- **Full Editor** - Canvas with pan, zoom, drag, resize, inline editing
- **Node Formatting** - Colors, fonts, shapes (rounded, square, circle, diamond)
- **Edge Management** - Curved bezier paths with labels, custom thickness/color
- **Auto Layout** - Tree layout algorithm (left-to-right)
- **Keyboard Shortcuts** - Delete, Ctrl+Z undo, Ctrl+A select all, Escape deselect
- **Context Menu** - Right-click to add child, note, attach link, delete
- **Collapse/Expand** - Hide descendant nodes
- **Google Drive Links** - Clickable link icons on nodes
- **Export** - Save as JSON file download
- **localStorage Backup** - Auto-saves to browser storage

## File Structure

```
index.html          - Home screen: folder/map browser
editor.html         - Mind map editor page
css/styles.css      - All shared styles
js/home.js          - Home screen logic
js/editor.js        - Core editor (canvas, pan, zoom, selection)
js/nodes.js         - Node rendering and formatting
js/edges.js         - Edge rendering and formatting
js/storage.js       - Load/save JSON, localStorage backup
js/autolayout.js    - Auto-layout algorithm
maps/index.json     - Folder/map index for static hosting
maps/               - Mind map JSON files organized by folder
```

## Usage

1. Open `index.html` to see the home dashboard
2. Click a folder to expand it and see available maps
3. Click a map to open it in the editor
4. Edit nodes, edges, colors, and layout
5. Click "Save" to download the updated JSON file

## Developed by

[Ilkhom Makhkambaev](https://ilkhom-makhkambaev.mystrikingly.com/)
