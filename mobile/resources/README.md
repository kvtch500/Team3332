# App icon & splash source images

Drop two files here, then generate all platform sizes automatically:

- `icon.png` — 1024×1024, no transparency, no rounded corners (Apple adds the mask).
- `splash.png` — 2732×2732, artwork centered in the middle ~1200px (the edges get cropped
  on different aspect ratios). Background should be the brand black `#080B12`.

Generate:

```bash
cd ..
npm i -D @capacitor/assets
npx capacitor-assets generate
```

This writes the iOS asset catalog and Android mipmaps into the native projects.
