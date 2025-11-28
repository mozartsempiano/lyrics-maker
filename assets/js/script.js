// =============================
// CONFIGURATION - edit these to change export and appearance
// =============================
const CONFIG = {
	// Export appearance
	exportBg: "#000000", // background color behind rounded card in exported image
	exportScale: 912 / 532, // export canvas scale (output width / preview width)
	exportJpegQuality: 0.92, // JPEG quality for final .jpg (0.0 - 1.0)

	// Card geometry and preview sizes
	previewWidth: 912, // preview width in px
	previewHeight: 532, // preview height in px
	cardPaddingPx: 48, // vertical padding used in calculations (24 top + 24 bottom)
	defaultRadiusPx: 15, // fallback radius if CSS variable missing

	// Lyrics auto-sizing
	lyricsFontMaxEm: 9,
	lyricsFontMinEm: 0.6,
	lyricsFontStepEm: 0.01,

	// Color heuristics
	colorSampleStep: 8, // sample every N pixels when extracting colors
	grayThreshold: 10, // threshold for gray detection
	saturationBoostPercent: 28, // boost when color saturation is low
	minContrastRatio: 4.5, // WCAG minimum contrast ratio against black text
	// Additional geometry
	lyricsMaxHeightDefault: 342,
	logoHeight: 60,
	logoClearance: 8,
};

// DOM references
const coverUpload = document.getElementById("coverUpload");
const coverPreview = document.getElementById("coverPreview");
const titleInput = document.getElementById("titleInput");
const artistInput = document.getElementById("artistInput");
const lyricsInput = document.getElementById("lyricsInput");
const cardTitle = document.getElementById("cardTitle");
const cardArtist = document.getElementById("cardArtist");
const cardLyrics = document.getElementById("cardLyrics");
const bgColorInput = document.getElementById("bgColor");
const card = document.getElementById("card");
const copyBtn = document.getElementById("copyBtn");
const saveBtn = document.getElementById("saveBtn");
const autoColorCheckbox = document.getElementById("autoColorCheckbox");
const showLogoCheckbox = document.getElementById("showLogoCheckbox");
const spotifyLogo = document.getElementById("spotifyLogo");
const roundedCheckbox = document.getElementById("roundedCheckbox");
// legacy top-level exports (kept for compatibility)
const EXPORT_BG = CONFIG.exportBg;
const DEFAULT_CSS_RADIUS_PX = CONFIG.defaultRadiusPx;

// extract color counts from image (coarse quantization)
function getDominantColorCounts(img) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	canvas.width = img.width;
	canvas.height = img.height;

	ctx.drawImage(img, 0, 0, img.width, img.height);

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;

	const colorCount = {};
	const sampleStep = CONFIG.colorSampleStep; // sample every N pixels for speed

	for (let i = 0; i < data.length; i += sampleStep * 4) {
		const r = Math.floor(data[i] / 32) * 32;
		const g = Math.floor(data[i + 1] / 32) * 32;
		const b = Math.floor(data[i + 2] / 32) * 32;

		const key = `${r},${g},${b}`;
		colorCount[key] = (colorCount[key] || 0) + 1;
	}

	return colorCount; // { "r,g,b": count }
}

// determine if a color is grayish (low saturation)
function isGrayish(r, g, b, threshold = CONFIG.grayThreshold) {
	// smaller threshold -> fewer colors considered gray (more aggressive non-gray preference)
	return (
		Math.abs(r - g) <= threshold &&
		Math.abs(r - b) <= threshold &&
		Math.abs(g - b) <= threshold
	);
}

// choose the most common non-gray color; fall back to the absolute dominant color
function chooseDominantNonGray(colorCount) {
	let dominant = null;
	let maxCount = 0;

	// first pass: find the absolute dominant
	for (const key in colorCount) {
		if (colorCount[key] > maxCount) {
			maxCount = colorCount[key];
			dominant = key;
		}
	}

	// if absolute dominant is not gray, return it immediately
	if (dominant) {
		const [dr, dg, db] = dominant.split(",").map(Number);
		if (!isGrayish(dr, dg, db, CONFIG.grayThreshold)) return dominant;
	}

	// second pass: try to find the most frequent non-gray color
	let nonGray = null;
	let nonGrayCount = 0;
	for (const key in colorCount) {
		const [r, g, b] = key.split(",").map(Number);
		if (
			!isGrayish(r, g, b, CONFIG.grayThreshold) &&
			colorCount[key] > nonGrayCount
		) {
			nonGrayCount = colorCount[key];
			nonGray = key;
		}
	}

	// If a non-gray was found and it's reasonably frequent relative to dominant, prefer it
	// Lower threshold: accept a non-gray even if it has >= 15% of dominant count to be more aggressive.
	if (nonGray && nonGrayCount >= maxCount * 0.15) {
		return nonGray;
	}

	// otherwise return the absolute dominant (could be gray)
	return dominant;
}

// Convert RGB to Hex
function rgbToHex(rgb) {
	const result = rgb.match(/\d+/g);
	if (!result) return "#d84c3d";

	const r = parseInt(result[0]);
	const g = parseInt(result[1]);
	const b = parseInt(result[2]);

	return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// --- Color helpers: RGB <-> HSL and saturation boost ---
function rgbToHsl(r, g, b) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let h, s;
	const l = (max + min) / 2;

	if (max === min) {
		h = s = 0; // achromatic
	} else {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case r:
				h = (g - b) / d + (g < b ? 6 : 0);
				break;
			case g:
				h = (b - r) / d + 2;
				break;
			default:
				h = (r - g) / d + 4;
		}
		h /= 6;
	}
	return [h, s, l];
}

function hslToRgb(h, s, l) {
	let r, g, b;
	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const hue2rgb = (p, q, t) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}
	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function boostSaturationRgb(
	r,
	g,
	b,
	boostPercent = CONFIG.saturationBoostPercent
) {
	const [h, s, l] = rgbToHsl(r, g, b);
	const newS = Math.min(1, s + boostPercent / 100);
	const [nr, ng, nb] = hslToRgb(h, newS, l);
	return `rgb(${nr}, ${ng}, ${nb})`;
}

// Calculate luminance of a color (0-1, where 0 is black and 1 is white)
function getLuminance(r, g, b) {
	// Convert RGB to linear RGB
	const [rLin, gLin, bLin] = [r, g, b].map((c) => {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});

	// Calculate luminance using the formula
	return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

// Ensure minimum contrast ratio with black text
function ensureContrast(rgb) {
	const result = rgb.match(/\d+/g);
	if (!result) return rgb;

	let r = parseInt(result[0]);
	let g = parseInt(result[1]);
	let b = parseInt(result[2]);

	const minContrastRatio = CONFIG.minContrastRatio; // WCAG AA standard
	const blackLuminance = 0; // Luminance of black text

	let currentLuminance = getLuminance(r, g, b);
	let contrastRatio = (currentLuminance + 0.05) / (blackLuminance + 0.05);

	// If contrast is too low, lighten the color
	while (contrastRatio < minContrastRatio && currentLuminance < 0.8) {
		// Increase brightness by adding to each component
		const increment = 15;
		r = Math.min(255, r + increment);
		g = Math.min(255, g + increment);
		b = Math.min(255, b + increment);

		currentLuminance = getLuminance(r, g, b);
		contrastRatio = (currentLuminance + 0.05) / (blackLuminance + 0.05);
	}

	return `rgb(${r}, ${g}, ${b})`;
}

// Auto-update functionality
function adjustLyricsFontSize() {
	const maxFontSize = CONFIG.lyricsFontMaxEm;
	const minFontSize = CONFIG.lyricsFontMinEm;
	const stepSize = CONFIG.lyricsFontStepEm;

	// Reset to max size first
	cardLyrics.style.fontSize = maxFontSize + "em";

	// Get available space (card height minus header and padding)
	const cardHeight = CONFIG.previewHeight; // preview height
	const headerHeight = cardLyrics.previousElementSibling.offsetHeight;
	const cardPadding = CONFIG.cardPaddingPx; // 24px top + 24px bottom
	const logoSpace = showLogoCheckbox.checked ? 60 : 30; // Extra space for logo

	const cardInnerHeight = card.clientHeight; // includes padding, simpler than hardcoded 532/48
	const computed = getComputedStyle(cardLyrics);
	const cssMaxHeight =
		parseFloat(computed.maxHeight) || CONFIG.lyricsMaxHeightDefault; // fallback to config
	const lyricsMarginBottom = parseFloat(computed.marginBottom) || 0; // in px

	// reserve space for spotify logo if visible (logo height + small clearance)
	let logoReserve = 0;
	if (
		showLogoCheckbox.checked &&
		spotifyLogo &&
		getComputedStyle(spotifyLogo).display !== "none"
	) {
		logoReserve =
			spotifyLogo.getBoundingClientRect().height + CONFIG.logoClearance; // clearance from config
	}

	// If logo is hidden, allow lyrics to expand into logo area by increasing the effective max height
	const effectiveMax =
		showLogoCheckbox && !showLogoCheckbox.checked
			? cssMaxHeight + (logoReserve || 0)
			: cssMaxHeight;
	// write back to CSS custom property so CSS and JS stay in sync
	try {
		document.documentElement.style.setProperty(
			"--lyrics-max-height",
			effectiveMax + "px"
		);
	} catch (e) {
		/* ignore in environments that don't allow writing styles */
	}
	const availableHeight = Math.max(
		0,
		Math.min(
			effectiveMax,
			cardInnerHeight - headerHeight - logoReserve - lyricsMarginBottom
		)
	);

	let currentFontSize = maxFontSize;

	// Reduce font size until text fits
	while (
		cardLyrics.scrollHeight > availableHeight &&
		currentFontSize > minFontSize
	) {
		currentFontSize -= stepSize;
		cardLyrics.style.fontSize = currentFontSize + "em";
	}
}

function updateCard() {
	cardTitle.textContent = titleInput.value || "Song title";
	cardArtist.textContent = artistInput.value || "Artist";
	cardLyrics.textContent = lyricsInput.value || "Song lyrics...";

	// Update background color based on auto color setting
	if (autoColorCheckbox.checked && coverPreview.src && coverPreview.complete) {
		// Use auto color from cover image, preferring non-gray dominant colors
		try {
			const counts = getDominantColorCounts(coverPreview);
			const chosenKey = chooseDominantNonGray(counts);
			if (chosenKey) {
				let [r, g, b] = chosenKey.split(",").map(Number);
				let chosenRgb = `rgb(${r}, ${g}, ${b})`;
				// if chosen color is low saturation, boost it slightly to avoid grayish look
				const [, sVal] = rgbToHsl(r, g, b);
				if (sVal < 0.18) {
					chosenRgb = boostSaturationRgb(
						r,
						g,
						b,
						CONFIG.saturationBoostPercent
					);
					const boosted = chosenRgb.match(/\d+/g).map(Number);
					r = boosted[0];
					g = boosted[1];
					b = boosted[2];
				}
				const adjustedColor = ensureContrast(chosenRgb);
				const hexColor = rgbToHex(adjustedColor);
				card.style.backgroundColor = adjustedColor;
				bgColorInput.value = hexColor;
			} else {
				// fallback to previous approach if no colors found
				throw new Error("No dominant color found");
			}
		} catch (error) {
			console.error("Error extracting color:", error);
			// Fallback to manual color if extraction fails
			const hex = bgColorInput.value;
			const r = parseInt(hex.slice(1, 3), 16);
			const g = parseInt(hex.slice(3, 5), 16);
			const b = parseInt(hex.slice(5, 7), 16);
			const rgbColor = `rgb(${r}, ${g}, ${b})`;
			const adjustedColor = ensureContrast(rgbColor);
			card.style.backgroundColor = adjustedColor;
		}
	} else {
		// Use manual color picker value
		const hex = bgColorInput.value;
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const rgbColor = `rgb(${r}, ${g}, ${b})`;
		const adjustedColor = ensureContrast(rgbColor);
		card.style.backgroundColor = adjustedColor;

		// Update the color picker if the color was adjusted
		const adjustedHex = rgbToHex(adjustedColor);
		if (adjustedHex !== hex) {
			bgColorInput.value = adjustedHex;
		}
	}

	// Show/hide Spotify logo
	spotifyLogo.style.display = showLogoCheckbox.checked ? "block" : "none";

	// Sync CSS variable for lyrics max-height depending on logo state
	try {
		if (showLogoCheckbox.checked) {
			// When logo is visible, cap lyrics to the fixed visual limit
			document.documentElement.style.setProperty(
				"--lyrics-max-height",
				"342px"
			);
		} else {
			// When logo is hidden, allow lyrics to occupy the remaining vertical space
			// Compute available height inside card for lyrics region.
			const cardRect = card.getBoundingClientRect();
			const headerH = cardLyrics.previousElementSibling.offsetHeight || 0;
			const computed = getComputedStyle(cardLyrics);
			const lyricsMarginBottom = parseFloat(computed.marginBottom) || 0;
			const reserved = 24 + 24; // top + bottom padding used in layout (fallback)
			const remaining = Math.max(
				0,
				cardRect.height - headerH - lyricsMarginBottom - reserved
			);
			document.documentElement.style.setProperty(
				"--lyrics-max-height",
				remaining + "px"
			);
		}
	} catch (e) {
		// ignore if DOM not ready or styles cannot be written
	}

	// Apply rounded border if requested
	try {
		const rounded =
			typeof roundedCheckbox !== "undefined" &&
			roundedCheckbox &&
			roundedCheckbox.checked;
		// Update CSS variable so preview and exports stay in sync
		document.documentElement.style.setProperty(
			"--card-radius",
			rounded ? "20px" : "0px"
		);
		card.style.borderRadius =
			getComputedStyle(document.documentElement).getPropertyValue(
				"--card-radius"
			) || (rounded ? "20px" : "0px");
	} catch (e) {
		// If roundedCheckbox not found, ignore
	}

	// Adjust lyrics font size after content update
	setTimeout(adjustLyricsFontSize, 10); // Small delay to ensure DOM update
}

// Add event listeners for auto-update
titleInput.addEventListener("input", updateCard);
artistInput.addEventListener("input", updateCard);
lyricsInput.addEventListener("input", updateCard);
bgColorInput.addEventListener("input", updateCard);
autoColorCheckbox.addEventListener("change", updateCard);
showLogoCheckbox.addEventListener("change", updateCard);
if (roundedCheckbox) roundedCheckbox.addEventListener("change", updateCard);

coverUpload.addEventListener("change", function () {
	const file = this.files[0];
	if (file) {
		const reader = new FileReader();
		reader.onload = function (e) {
			coverPreview.src = e.target.result;

			// Update card after image loads
			coverPreview.onload = function () {
				updateCard();
			};
		};
		reader.readAsDataURL(file);
	}
});

// Helper: rasterize an inline SVG element to a PNG data URL
async function rasterizeSvgToPng(svgEl) {
	const svgClone = svgEl.cloneNode(true);
	const computedColor = getComputedStyle(svgEl).color || "#000";
	svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svgClone.setAttribute("style", `color: ${computedColor};`);
	const svgData = new XMLSerializer().serializeToString(svgClone);
	const svgDataUrl =
		"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgData);

	const img = new Image();
	img.src = svgDataUrl;
	await new Promise((res, rej) => {
		img.onload = res;
		img.onerror = rej;
	});

	const rect = svgEl.getBoundingClientRect();
	// Render at higher internal resolution to avoid halos when scaled
	const dpr = window.devicePixelRatio || 1;
	const scaleMultiplier = Math.max(2, Math.round(dpr));
	const w = Math.max(1, Math.round(rect.width * scaleMultiplier));
	const h = Math.max(1, Math.round(rect.height * scaleMultiplier));

	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");

	// Use high quality smoothing for anti-aliasing
	if (ctx) {
		ctx.imageSmoothingEnabled = true;
		if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
	}

	// Determine an opaque background color matching the card.
	// If computed background is transparent (e.g., gradient or none), fall back to the hex picker or white.
	let cardBg = getComputedStyle(card).backgroundColor || "rgba(0,0,0,0)";
	if (!cardBg || cardBg === "transparent" || cardBg === "rgba(0, 0, 0, 0)") {
		const hex =
			typeof bgColorInput !== "undefined" && bgColorInput.value
				? bgColorInput.value
				: "#ffffff";
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		cardBg = `rgb(${r}, ${g}, ${b})`;
	}

	// Fill opaque background to avoid transparent anti-aliased edges blending with page background
	ctx.fillStyle = cardBg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Draw the SVG source scaled to the high-res canvas
	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	return canvas.toDataURL("image/png");
}

// Helper: insert temporary image over svgEl, capture the card, then restore
async function captureCardWithTempImage(pngDataUrl, svgEl) {
	const svgRect = svgEl.getBoundingClientRect();
	const cardRect = card.getBoundingClientRect();
	const left = svgRect.left - cardRect.left;
	const top = svgRect.top - cardRect.top;

	const tempImg = document.createElement("img");
	tempImg.src = pngDataUrl;
	tempImg.id = "spotifyLogoRasterized";
	tempImg.style.position = "absolute";
	tempImg.style.left = left + "px";
	tempImg.style.top = top + "px";
	// Keep CSS size equal to original so layout doesn't change; the PNG may be higher-res internally
	tempImg.style.width = svgRect.width + "px";
	tempImg.style.height = svgRect.height + "px";
	tempImg.style.pointerEvents = "none";
	// Ensure the image has the same background as the card and uses default smoothing
	const cardBg = getComputedStyle(card).backgroundColor || "rgb(255,255,255)";
	tempImg.style.backgroundColor = cardBg;
	tempImg.style.imageRendering = "auto";
	tempImg.style.willChange = "transform, opacity";
	card.appendChild(tempImg);
	svgEl.style.display = "none";

	const canvas = await html2canvas(card, {
		backgroundColor: getComputedStyle(card).backgroundColor || null,
		scale: CONFIG.exportScale,
		useCORS: true,
	});

	tempImg.remove();
	svgEl.style.display = "";
	return canvas;
}

// Helper: create a final export canvas from a source canvas
// - preserves EXPORT_BG behind rounded corners
// - applies rounded clipping when `rounded` is true
function createExportCanvas(sourceCanvas, rounded) {
	const outputWidth = sourceCanvas.width;
	const outputHeight = sourceCanvas.height;
	const outCanvas = document.createElement("canvas");
	outCanvas.width = outputWidth;
	outCanvas.height = outputHeight;
	const outCtx = outCanvas.getContext("2d");

	// fill background behind rounded card
	outCtx.fillStyle = EXPORT_BG;
	outCtx.fillRect(0, 0, outputWidth, outputHeight);

	// compute scaled radius from CSS variable
	const cardRect = card.getBoundingClientRect();
	const scaleFactor = cardRect.width ? outputWidth / cardRect.width : 1;
	let defaultCssRadius = DEFAULT_CSS_RADIUS_PX;
	try {
		const cssVal =
			getComputedStyle(document.documentElement).getPropertyValue(
				"--card-radius"
			) || DEFAULT_CSS_RADIUS_PX + "px";
		defaultCssRadius = parseFloat(cssVal) || DEFAULT_CSS_RADIUS_PX;
	} catch (e) {
		defaultCssRadius = DEFAULT_CSS_RADIUS_PX;
	}
	const radiusPx = rounded ? defaultCssRadius * scaleFactor : 0;

	if (radiusPx > 0) {
		const r = radiusPx;
		const w = outputWidth;
		const h = outputHeight;
		outCtx.save();
		outCtx.beginPath();
		outCtx.moveTo(r, 0);
		outCtx.lineTo(w - r, 0);
		outCtx.quadraticCurveTo(w, 0, w, r);
		outCtx.lineTo(w, h - r);
		outCtx.quadraticCurveTo(w, h, w - r, h);
		outCtx.lineTo(r, h);
		outCtx.quadraticCurveTo(0, h, 0, h - r);
		outCtx.lineTo(0, r);
		outCtx.quadraticCurveTo(0, 0, r, 0);
		outCtx.closePath();
		outCtx.clip();
		outCtx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
		outCtx.restore();
	} else {
		outCtx.drawImage(sourceCanvas, 0, 0, outputWidth, outputHeight);
	}

	return outCanvas;
}

// Copy to clipboard function (uses helpers; falls back to download)
copyBtn.addEventListener("click", async function () {
	try {
		if (typeof html2canvas === "undefined") {
			alert("To use the copy function, html2canvas library is required.");
			return;
		}

		const svgEl = document.getElementById("spotifyLogo");
		let canvas;

		if (!svgEl || getComputedStyle(svgEl).display === "none") {
			canvas = await html2canvas(card, {
				backgroundColor: getComputedStyle(card).backgroundColor || null,
				scale: CONFIG.exportScale,
				useCORS: true,
			});
		} else {
			const pngDataUrl = await rasterizeSvgToPng(svgEl);
			canvas = await captureCardWithTempImage(pngDataUrl, svgEl);
		}

		// Composite and export using helper
		(async () => {
			const outCanvas = createExportCanvas(
				canvas,
				roundedCheckbox && roundedCheckbox.checked
			);

			outCanvas.toBlob(async (pngBlob) => {
				if (!pngBlob) {
					alert("Failed to create image blob.");
					return;
				}

				if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
					alert(
						"Clipboard image write not supported in this browser. Copy is unavailable."
					);
					return;
				}

				try {
					await navigator.clipboard.write([
						new ClipboardItem({ "image/png": pngBlob }),
					]);
					alert("Card copied to clipboard!");
					return;
				} catch (err) {
					console.warn(
						"PNG clipboard write failed, trying JPEG fallback:",
						err
					);
				}

				// JPEG fallback
				outCanvas.toBlob(
					async (jpegBlob) => {
						if (!jpegBlob) {
							alert("Failed to create JPEG fallback blob for clipboard.");
							return;
						}
						try {
							await navigator.clipboard.write([
								new ClipboardItem({ "image/jpeg": jpegBlob }),
							]);
							alert("Card copied to clipboard! (JPEG)");
							return;
						} catch (err2) {
							console.error("JPEG clipboard write also failed:", err2);
							alert(
								"Could not write image to clipboard (browser may require HTTPS/permission)."
							);
							return;
						}
					},
					"image/jpeg",
					CONFIG.exportJpegQuality
				);
			}, "image/png");
		})();
	} catch (err) {
		console.error("Erro ao copiar:", err);
		alert("Error copying to clipboard.");
	}
});

// Save as JPG function (uses helpers)
saveBtn.addEventListener("click", async function () {
	try {
		if (typeof html2canvas === "undefined") {
			alert("To use the save function, html2canvas library is required.");
			return;
		}

		const svgEl = document.getElementById("spotifyLogo");
		let canvas;

		if (!svgEl || getComputedStyle(svgEl).display === "none") {
			canvas = await html2canvas(card, {
				backgroundColor: getComputedStyle(card).backgroundColor || null,
				scale: CONFIG.exportScale,
				useCORS: true,
			});
		} else {
			const pngDataUrl = await rasterizeSvgToPng(svgEl);
			canvas = await captureCardWithTempImage(pngDataUrl, svgEl);
		}

		// Compose and save using helper
		(async () => {
			const outCanvas = createExportCanvas(
				canvas,
				roundedCheckbox && roundedCheckbox.checked
			);

			outCanvas.toBlob(
				(blob) => {
					if (!blob) {
						alert("Failed to create image blob.");
						return;
					}
					const url = URL.createObjectURL(blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = `spotify-lyrics-${Date.now()}.jpg`;
					document.body.appendChild(a);
					a.click();
					document.body.removeChild(a);
					URL.revokeObjectURL(url);
				},
				"image/jpeg",
				CONFIG.exportJpegQuality
			);
		})();
	} catch (err) {
		console.error("Erro ao salvar:", err);
		alert("Error saving image.");
	}
});

// Initial update
updateCard();
