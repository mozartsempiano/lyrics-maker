const CONFIG = {
	exportBg: "#000000",
	exportScale: 912 / 532,
	exportJpegQuality: 0.92,

	cardPaddingPx: 48,
	cardRadiusRoundedPx: 16,

	lyricsFontMaxEm: 9,
	lyricsFontMinEm: 0.6,
	lyricsFontStepEm: 0.01,

	colorSampleStep: 8,
	grayThreshold: 10,
	saturationBoostPercent: 28,
	minContrastRatio: 4.5,
	lyricsMaxHeightDefault: 342,
	logoClearance: 8,
};

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

const bgColorFormGroup = bgColorInput.closest(".form-group");
function updateBgColorState() {
	if (autoColorCheckbox.checked) {
		bgColorInput.disabled = true;
		bgColorFormGroup.classList.add("disabled-form-group");
	} else {
		bgColorInput.disabled = false;
		bgColorFormGroup.classList.remove("disabled-form-group");
	}
}
autoColorCheckbox.addEventListener("change", updateBgColorState);
updateBgColorState();
const EXPORT_BG = CONFIG.exportBg;
const DEFAULT_CSS_RADIUS_PX = CONFIG.cardRadiusRoundedPx;

function getDominantColorCounts(img) {
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");

	canvas.width = img.width;
	canvas.height = img.height;

	ctx.drawImage(img, 0, 0, img.width, img.height);

	const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
	const data = imageData.data;

	const colorCount = {};
	const sampleStep = CONFIG.colorSampleStep;

	for (let i = 0; i < data.length; i += sampleStep * 4) {
		const r = Math.floor(data[i] / 32) * 32;
		const g = Math.floor(data[i + 1] / 32) * 32;
		const b = Math.floor(data[i + 2] / 32) * 32;

		const key = `${r},${g},${b}`;
		colorCount[key] = (colorCount[key] || 0) + 1;
	}

	return colorCount;
}

function isGrayish(r, g, b, threshold = CONFIG.grayThreshold) {
	return (
		Math.abs(r - g) <= threshold &&
		Math.abs(r - b) <= threshold &&
		Math.abs(g - b) <= threshold
	);
}

function chooseDominantNonGray(colorCount) {
	let dominant = null;
	let maxCount = 0;

	for (const key in colorCount) {
		if (colorCount[key] > maxCount) {
			maxCount = colorCount[key];
			dominant = key;
		}
	}

	if (dominant) {
		const [dr, dg, db] = dominant.split(",").map(Number);
		if (!isGrayish(dr, dg, db, CONFIG.grayThreshold)) return dominant;
	}

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

	if (nonGray && nonGrayCount >= maxCount * 0.15) {
		return nonGray;
	}

	return dominant;
}

function rgbToHex(rgb) {
	const result = rgb.match(/\d+/g);
	if (!result) return "#d84c3d";

	const r = parseInt(result[0]);
	const g = parseInt(result[1]);
	const b = parseInt(result[2]);

	return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function rgbToHsl(r, g, b) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	let h, s;
	const l = (max + min) / 2;

	if (max === min) {
		h = s = 0;
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
		r = g = b = l;
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

function getLuminance(r, g, b) {
	const [rLin, gLin, bLin] = [r, g, b].map((c) => {
		c = c / 255;
		return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
	});

	return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

function ensureContrast(rgb) {
	const result = rgb.match(/\d+/g);
	if (!result) return rgb;

	let r = parseInt(result[0]);
	let g = parseInt(result[1]);
	let b = parseInt(result[2]);

	const minContrastRatio = CONFIG.minContrastRatio;
	const blackLuminance = 0;

	let currentLuminance = getLuminance(r, g, b);
	let contrastRatio = (currentLuminance + 0.05) / (blackLuminance + 0.05);

	while (contrastRatio < minContrastRatio && currentLuminance < 0.8) {
		const increment = 15;
		r = Math.min(255, r + increment);
		g = Math.min(255, g + increment);
		b = Math.min(255, b + increment);

		currentLuminance = getLuminance(r, g, b);
		contrastRatio = (currentLuminance + 0.05) / (blackLuminance + 0.05);
	}

	return `rgb(${r}, ${g}, ${b})`;
}

function setRootCssVariable(name, value) {
	try {
		document.documentElement.style.setProperty(name, value);
	} catch (e) {
	}
}

function isRoundedEnabled() {
	return Boolean(roundedCheckbox && roundedCheckbox.checked);
}

function parseHexToRgbString(hex) {
	if (!/^#[0-9a-fA-F]{6}$/.test(hex || "")) return null;
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `rgb(${r}, ${g}, ${b})`;
}

function updateCardText() {
	cardTitle.textContent = titleInput.value || "Song title";
	cardArtist.textContent = artistInput.value || "Artist";
	cardLyrics.textContent = lyricsInput.value || "Song lyrics...";
}

function updateLogoVisibility() {
	spotifyLogo.style.display = showLogoCheckbox.checked ? "block" : "none";
}

function updateCardRadius() {
	setRootCssVariable(
		"--card-radius",
		`${isRoundedEnabled() ? CONFIG.cardRadiusRoundedPx : 0}px`
	);
}

function getLogoReserveHeight() {
	if (
		showLogoCheckbox.checked &&
		spotifyLogo &&
		getComputedStyle(spotifyLogo).display !== "none"
	) {
		return spotifyLogo.getBoundingClientRect().height + CONFIG.logoClearance;
	}
	return 0;
}

function computeLyricsMaxHeight() {
	if (showLogoCheckbox.checked) {
		return CONFIG.lyricsMaxHeightDefault;
	}

	const cardRect = card.getBoundingClientRect();
	const headerHeight = cardLyrics.previousElementSibling
		? cardLyrics.previousElementSibling.offsetHeight
		: 0;
	const computed = getComputedStyle(cardLyrics);
	const lyricsMarginBottom = parseFloat(computed.marginBottom) || 0;

	return Math.max(
		0,
		cardRect.height - headerHeight - lyricsMarginBottom - CONFIG.cardPaddingPx
	);
}

function syncLyricsMaxHeight() {
	setRootCssVariable("--lyrics-max-height", `${computeLyricsMaxHeight()}px`);
}

function getAutoBackgroundColor() {
	if (!(autoColorCheckbox.checked && coverPreview.src && coverPreview.complete)) {
		return null;
	}

	try {
		const counts = getDominantColorCounts(coverPreview);
		const chosenKey = chooseDominantNonGray(counts);
		if (!chosenKey) throw new Error("No dominant color found");

		let [r, g, b] = chosenKey.split(",").map(Number);
		let chosenRgb = `rgb(${r}, ${g}, ${b})`;
		const [, saturation] = rgbToHsl(r, g, b);

		if (saturation < 0.18) {
			chosenRgb = boostSaturationRgb(r, g, b, CONFIG.saturationBoostPercent);
		}

		return chosenRgb;
	} catch (error) {
		console.error("Error extracting color:", error);
		return null;
	}
}

function applyAdjustedCardColor(rgbColor) {
	const adjustedColor = ensureContrast(rgbColor);
	card.style.backgroundColor = adjustedColor;

	const adjustedHex = rgbToHex(adjustedColor);
	if (bgColorInput.value !== adjustedHex) {
		bgColorInput.value = adjustedHex;
	}
}

function updateCardBackground() {
	const autoColor = getAutoBackgroundColor();
	if (autoColor) {
		applyAdjustedCardColor(autoColor);
		return;
	}

	const fallbackRgb = "rgb(216, 76, 61)";
	const manualRgb = parseHexToRgbString(bgColorInput.value) || fallbackRgb;
	applyAdjustedCardColor(manualRgb);
}

function adjustLyricsFontSize() {
	const maxFontSize = CONFIG.lyricsFontMaxEm;
	const minFontSize = CONFIG.lyricsFontMinEm;
	const stepSize = CONFIG.lyricsFontStepEm;

	cardLyrics.style.fontSize = maxFontSize + "em";

	const headerHeight = cardLyrics.previousElementSibling
		? cardLyrics.previousElementSibling.offsetHeight
		: 0;
	const computed = getComputedStyle(cardLyrics);
	const cssMaxHeight =
		parseFloat(computed.maxHeight) || CONFIG.lyricsMaxHeightDefault;
	const lyricsMarginBottom = parseFloat(computed.marginBottom) || 0;
	const logoReserve = getLogoReserveHeight();

	const availableHeight = Math.max(
		0,
		Math.min(
			cssMaxHeight,
			card.clientHeight - headerHeight - logoReserve - lyricsMarginBottom
		)
	);

	let currentFontSize = maxFontSize;

	while (
		cardLyrics.scrollHeight > availableHeight &&
		currentFontSize > minFontSize
	) {
		currentFontSize -= stepSize;
		cardLyrics.style.fontSize = currentFontSize + "em";
	}
}

function updateCard() {
	updateCardText();
	updateCardBackground();
	updateLogoVisibility();
	updateCardRadius();
	syncLyricsMaxHeight();

	setTimeout(adjustLyricsFontSize, 10);
}

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

			coverPreview.onload = function () {
				updateCard();
			};
		};
		reader.readAsDataURL(file);
	}
});

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
	const dpr = window.devicePixelRatio || 1;
	const scaleMultiplier = Math.max(2, Math.round(dpr));
	const w = Math.max(1, Math.round(rect.width * scaleMultiplier));
	const h = Math.max(1, Math.round(rect.height * scaleMultiplier));

	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");

	if (ctx) {
		ctx.imageSmoothingEnabled = true;
		if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
	}

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

	ctx.fillStyle = cardBg;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

	return canvas.toDataURL("image/png");
}

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
	tempImg.style.width = svgRect.width + "px";
	tempImg.style.height = svgRect.height + "px";
	tempImg.style.pointerEvents = "none";
	const cardBg = getComputedStyle(card).backgroundColor || "rgb(255,255,255)";
	tempImg.style.backgroundColor = cardBg;
	tempImg.style.imageRendering = "auto";
	tempImg.style.willChange = "transform, opacity";
	card.appendChild(tempImg);
	svgEl.style.display = "none";

	const canvas = await html2canvas(card, getCaptureOptions());

	tempImg.remove();
	svgEl.style.display = "";
	return canvas;
}

function createExportCanvas(sourceCanvas, rounded) {
	const outputWidth = sourceCanvas.width;
	const outputHeight = sourceCanvas.height;
	const outCanvas = document.createElement("canvas");
	outCanvas.width = outputWidth;
	outCanvas.height = outputHeight;
	const outCtx = outCanvas.getContext("2d");

	outCtx.fillStyle = EXPORT_BG;
	outCtx.fillRect(0, 0, outputWidth, outputHeight);

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

function ensureHtml2CanvasAvailable(actionName) {
	if (typeof html2canvas === "undefined") {
		alert(`To use the ${actionName} function, html2canvas library is required.`);
		return false;
	}
	return true;
}

function getCaptureOptions() {
	return {
		backgroundColor: getComputedStyle(card).backgroundColor || null,
		scale: CONFIG.exportScale,
		useCORS: true,
	};
}

async function captureCardCanvas() {
	const svgEl = document.getElementById("spotifyLogo");
	if (!svgEl || getComputedStyle(svgEl).display === "none") {
		return html2canvas(card, getCaptureOptions());
	}

	const pngDataUrl = await rasterizeSvgToPng(svgEl);
	return captureCardWithTempImage(pngDataUrl, svgEl);
}

function canvasToBlob(canvas, type, quality) {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) {
					reject(new Error("Failed to create image blob."));
					return;
				}
				resolve(blob);
			},
			type,
			quality
		);
	});
}

function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

async function buildExportCanvas() {
	const capturedCanvas = await captureCardCanvas();
	return createExportCanvas(capturedCanvas, isRoundedEnabled());
}

async function copyCardToClipboard() {
	try {
		if (!ensureHtml2CanvasAvailable("copy")) return;

		const outCanvas = await buildExportCanvas();
		if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
			alert(
				"Clipboard image write not supported in this browser. Copy is unavailable."
			);
			return;
		}

		try {
			const pngBlob = await canvasToBlob(outCanvas, "image/png");
			await navigator.clipboard.write([
				new ClipboardItem({ "image/png": pngBlob }),
			]);
			alert("Card copied to clipboard!");
			return;
		} catch (err) {
			console.warn("PNG clipboard write failed, trying JPEG fallback:", err);
		}

		try {
			const jpegBlob = await canvasToBlob(
				outCanvas,
				"image/jpeg",
				CONFIG.exportJpegQuality
			);
			await navigator.clipboard.write([
				new ClipboardItem({ "image/jpeg": jpegBlob }),
			]);
			alert("Card copied to clipboard! (JPEG)");
		} catch (err2) {
			console.error("JPEG clipboard write also failed:", err2);
			alert(
				"Could not write image to clipboard (browser may require HTTPS/permission)."
			);
		}
	} catch (err) {
		console.error("Erro ao copiar:", err);
		alert("Error copying to clipboard.");
	}
}

async function saveCardAsJpg() {
	try {
		if (!ensureHtml2CanvasAvailable("save")) return;

		const outCanvas = await buildExportCanvas();
		const jpegBlob = await canvasToBlob(
			outCanvas,
			"image/jpeg",
			CONFIG.exportJpegQuality
		);
		downloadBlob(jpegBlob, `spotify-lyrics-${Date.now()}.jpg`);
	} catch (err) {
		console.error("Erro ao salvar:", err);
		alert("Error saving image.");
	}
}

copyBtn.addEventListener("click", copyCardToClipboard);
saveBtn.addEventListener("click", saveCardAsJpg);

updateCard();
