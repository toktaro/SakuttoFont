# Modifications to `potrace_custom.js`

This document summarizes the changes made to the original `potrace.js`on October 22, 2025.

## Purpose of the Changes

The `Potrace.loadImageFromUrl()` function loads images asynchronously, but it lacked a standard mechanism to determine when the loading process was complete.
This modification introduces a callback feature to the function, allowing developers to execute arbitrary code at the precise moment the image has finished loading.

## Details of the Changes

### 1. Added a Callback Argument to `loadImageFromUrl`

The `loadImageFromUrl` function has been modified to accept a callback function `cb` as its second argument.
The provided callback is then temporarily stored in the module-scoped `callback` variable to be executed once the image loading is complete.

**Before (`potrace.js`)**

```javascript
  function loadImageFromUrl(url) {
    if (info.isReady) {
      clear();
    }
    imgElement.src = url;
    
  }
```

**After (`potrace_custom.js`)**

```javascript
  function loadImageFromUrl(url, cb) { // ← Added a second argument 'cb'
    if (info.isReady) {
      clear();
    }
    callback = cb; // ← Temporarily store the provided callback
    imgElement.src = url;
  }
```

### 2. Added Callback Execution Logic to `imgElement.onload`

The `imgElement.onload` event handler has been updated. After the image data is prepared by `loadCanvas()` and `loadBm()`, it now checks if the `callback` variable has been set. If it exists, the callback function is executed. This ensures that the callback provided to `loadImageFromUrl` is invoked at the appropriate time. After execution, the `callback` variable is cleared (set to `null`) to prevent it from being called again unintentionally.

**Before (`potrace.js`)**

```javascript
  imgElement.onload = function() {
    loadCanvas();
    loadBm();
  };
```

**After (`potrace_custom.js`)**

```javascript
  imgElement.onload = function() {
    loadCanvas();
    loadBm();
    if (callback) { // ← If a callback has been set,
      callback();   // ← execute it,
      callback = null; // ← and clear it afterward.
    }
  };
```

## Summary

As a result of these modifications, you can now call `Potrace.loadImageFromUrl()` with a callback to ensure subsequent actions are performed only after the image has been successfully loaded, as shown in the example below.

```javascript
Potrace.loadImageFromUrl('path/to/image.png', function() {
  console.log('Image has finished loading.');
  // Now it's safe to call Potrace.process() or other functions.
});
```