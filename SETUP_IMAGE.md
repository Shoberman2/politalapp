# How to Add the U.S. Congress Background Image

## Quick Setup

1. **Download the Image**
   - Find a high-quality U.S. Congress building image
   - Recommended: Use an image from https://unsplash.com/s/photos/us-congress
   - Or download from: https://online.maryville.edu/blog/difference-between-house-and-senate/
   - Save it as `U.S.-Congress.jpg`

2. **Add to Project**
   - Place the image file in the `public` folder of your project:
     ```
     politicalapp/
     └── public/
         └── U.S.-Congress.jpg
     ```

3. **Verify**
   - The CSS is already configured to use `/U.S.-Congress.jpg`
   - The image will automatically appear as the hero background
   - A dark overlay (75% opacity) ensures text remains readable

## Alternative: Use a Different Image

If you want to use a different image name or location:

1. Place your image in the `public` folder with any name (e.g., `congress-building.jpg`)

2. Update `src/styles/Landing.css` line 15:
   ```css
   /* Change this: */
   url('/U.S.-Congress.jpg') center center / cover no-repeat;

   /* To this: */
   url('/your-image-name.jpg') center center / cover no-repeat;
   ```

## Image Recommendations

**Best Image Specs:**
- **Resolution**: At least 1920x1080 (Full HD)
- **Aspect Ratio**: 16:9 or wider
- **File Format**: JPG (compressed for web)
- **File Size**: Under 500KB (optimized for fast loading)
- **Subject**: U.S. Capitol building, preferably front view

**Good Free Sources:**
- Unsplash: https://unsplash.com/s/photos/us-capitol
- Pexels: https://www.pexels.com/search/us%20congress/
- Pixabay: https://pixabay.com/images/search/us%20capitol/

## Current Styling

The background image has:
- **Dark overlay**: 75% black gradient for text readability
- **Cover sizing**: Image fills entire hero section
- **Center position**: Image centered both horizontally and vertically
- **Fixed attachment**: Image stays in place while content scrolls (on desktop)

## Troubleshooting

**Image not showing?**
1. Check file is in `public/` folder (not `src/`)
2. Verify filename exactly matches: `U.S.-Congress.jpg` (case-sensitive)
3. Clear browser cache and hard refresh (Cmd/Ctrl + Shift + R)
4. Check browser console for 404 errors

**Image too dark/light?**
Adjust the overlay opacity in `src/styles/Landing.css` line 14:
```css
/* Less dark (change 0.75 to 0.5): */
linear-gradient(135deg, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.4) 100%),

/* More dark (change 0.75 to 0.85): */
linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.75) 100%),
```

**Image not covering full area?**
The CSS uses `cover` which automatically fills the space. If you see white space:
- Use a higher resolution image
- Check the image aspect ratio (should be landscape/wide)

---

Once you add the image file, the landing page will have a stunning U.S. Congress building background! 🏛️
