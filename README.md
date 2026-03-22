# My Mind Map Manager

A professional, modular mind map editor built as a pure static web app. Runs on GitHub Pages with no server or external JS libraries.

## Features

- **Home Dashboard** - Browse organization folders and mind maps
- **Full Editor** - Canvas with pan, zoom, drag, resize, inline editing
- **Node Formatting** - 8 colors, fonts, shapes (rounded, square, circle, diamond)
- **Edge Management** - Bezier curves with labels, custom thickness/color
- **Auto Layout** - Left-to-right tree layout algorithm
- **Keyboard Shortcuts** - Delete, Ctrl+Z, Ctrl+A, Escape
- **Context Menu** - Right-click for add child, note, link, delete
- **Collapse/Expand** - Hide descendant nodes
- **Google Drive Links** - Clickable link icons on nodes
- **Export** - Save as JSON download, localStorage backup

## File Structure

```
index.html          Home screen: folder/map browser
editor.html         Mind map editor page
css/styles.css      All shared styles
js/home.js          Home screen logic
js/editor.js        Core editor (canvas, pan, zoom, selection)
js/nodes.js         Node rendering and formatting
js/edges.js         Edge rendering (SVG bezier curves)
js/ui.js            Format panel, context menu, toolbar
js/storage.js       Load/save JSON, localStorage backup
js/autolayout.js    Auto-layout algorithm
maps/index.json     Folder/map index for static hosting
maps/               Mind map JSON files by folder
```

## Developed by

[Ilkhom Makhkambaev](https://ilkhom-makhkambaev.mystrikingly.com/)
