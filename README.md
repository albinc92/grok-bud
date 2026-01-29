# Grok Bud 🤖

A TypeScript web app for interacting with the [xAI Grok API](https://docs.x.ai/docs/api-reference). Save your favorite AI conversations and generated images in a beautiful gallery view.

## ✨ Features

- **🖼️ Gallery View** - Browse and manage your favorited AI interactions
- **💬 Chat Interface** - Have conversations with Grok AI models
- **🎨 Image Generation** - Create images using Grok's imagination
- **❤️ Favorites System** - Save and organize your best outputs
- **🏷️ Tagging** - Categorize your saved content
- **📤 Export** - Download your data as JSON
- **🌙 Dark Mode** - Beautiful dark theme by default

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ 
- [npm](https://www.npmjs.com/) 9+
- A Grok API key from [console.x.ai](https://console.x.ai/)

### Installation

1. Clone or navigate to the project directory:
   ```bash
   cd grok-bud
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

5. Go to **Settings** and enter your Grok API key

## 📁 Project Structure

```
grok-bud/
├── src/
│   ├── main.ts          # App entry point
│   ├── app.ts           # Main application class
│   ├── api.ts           # Grok API client
│   ├── storage.ts       # LocalStorage utilities
│   ├── types.ts         # TypeScript interfaces
│   ├── icons.ts         # SVG icon components
│   └── styles.css       # Global styles
├── public/
│   └── grok.svg         # App icon
├── index.html           # HTML template
├── package.json         # Dependencies & scripts
├── tsconfig.json        # TypeScript config
└── vite.config.ts       # Vite configuration
```

## 🛠️ Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with HMR |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## 🔌 API Integration

This app integrates with the following Grok API endpoints:

- **Chat Completions** (`/v1/chat/completions`) - For conversational AI
- **Image Generations** (`/v1/images/generations`) - For creating images
- **Models** (`/v1/models`) - For listing available models

### Supported Models

- `grok-4` - Latest flagship model
- `grok-3` - Previous generation flagship
- `grok-3-mini` - Faster, lighter model
- `grok-imagine-image` - Image generation

## 💾 Data Storage

All data is stored locally in your browser using `localStorage`:

- API key (encrypted recommended for production)
- Favorite posts with prompts, responses, and metadata
- User preferences (selected model, etc.)

## 🎨 Customization

The app uses CSS custom properties for theming. Edit `src/styles.css` to customize:

```css
:root {
  --color-primary: #6366f1;
  --color-accent: #8b5cf6;
  --color-bg: #0f0f0f;
  /* ... more variables */
}
```

## 📝 License

MIT License - feel free to use this project as a starting point for your own Grok integrations!

## 🔗 Resources

- [Grok API Documentation](https://docs.x.ai/docs/api-reference)
- [xAI Console](https://console.x.ai/)
- [Vite Documentation](https://vitejs.dev/)