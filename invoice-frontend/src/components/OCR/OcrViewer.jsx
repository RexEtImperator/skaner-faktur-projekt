import React, { useState, useRef, useEffect } from 'react';

/**
 * OcrViewer
 * Wyświetla obraz dokumentu po lewej z overlay boxami (bbox) oraz listę wykrytych pól po prawej.
 * Hover po obu stronach synchronizuje podświetlenie odpowiednich elementów.
 *
 * Props:
 * - imageUrl: string - adres obrazu dokumentu
 * - fields: Array<{ id: string, label: string, value: string, bbox?: { x: number, y: number, w: number, h: number } }>
 *   współrzędne bbox są znormalizowane (0..1) względem szerokości i wysokości obrazu
 * - words: Array<{ text: string, bbox: { x: number, y: number, w: number, h: number } }>
 *   pojedyncze słowa z OCR (znormalizowane bbox), używane do podświetlania na podstawie wartości pola
 */
const OcrViewer = ({ imageUrl, fields = [], words = [], rawLines = [], defaultTab = 'detected', overlayMode: initialOverlayMode = 'fields_and_words' }) => {
  const [hoveredId, setHoveredId] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab === 'raw' ? 'raw' : 'detected'); // 'detected' | 'raw'
  const [overlayMode, setOverlayMode] = useState(initialOverlayMode); // 'fields_and_words' | 'words_only' | 'lines'
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const [copiedId, setCopiedId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  const handleEnter = (id) => setHoveredId(id);
  const handleLeave = () => setHoveredId(null);

  // Funkcje obsługi zoom i przesuwania
  // Uwaga: wheel listener dodajemy jako native z passive:false, aby skutecznie blokować scroll strony
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(0.5, Math.min(3, zoom + delta));
    setZoom(newZoom);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(3, prev + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleMouseDown = (e) => {
    if (e.button === 0) { // lewy przycisk myszy
      setIsDragging(true);
      setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetZoomPan = () => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Grupowanie słów w wiersze na podstawie pozycji Y
  const groupWordsIntoLines = (words) => {
    if (!words || words.length === 0) return [];
    
    const yThreshold = 0.02; // 2% wysokości dla znormalizowanych współrzędnych
    const sorted = [...words].sort((a, b) => a.bbox.y - b.bbox.y);
    const lines = [];
    let currentLine = [];
    
    for (const word of sorted) {
      if (currentLine.length === 0) {
        currentLine.push(word);
      } else {
        const lastWord = currentLine[currentLine.length - 1];
        if (Math.abs(word.bbox.y - lastWord.bbox.y) <= yThreshold) {
          currentLine.push(word);
        } else {
          // Sortuj słowa w linii według pozycji X
          currentLine.sort((a, b) => a.bbox.x - b.bbox.x);
          lines.push(currentLine);
          currentLine = [word];
        }
      }
    }
    
    if (currentLine.length > 0) {
      currentLine.sort((a, b) => a.bbox.x - b.bbox.x);
      lines.push(currentLine);
    }
    
    return lines;
  };

  // Oblicz bbox dla całej linii słów
  const getLineBBox = (lineWords) => {
    if (!lineWords || lineWords.length === 0) return null;
    
    const minX = Math.min(...lineWords.map(w => w.bbox.x));
    const minY = Math.min(...lineWords.map(w => w.bbox.y));
    const maxX = Math.max(...lineWords.map(w => w.bbox.x + w.bbox.w));
    const maxY = Math.max(...lineWords.map(w => w.bbox.y + w.bbox.h));
    
    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  };

  const tokensForField = (field) => {
    if (!field || !field.value) return [];
    return String(field.value)
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length >= 2);
  };

  // Wyszukaj bbox słów zawierających dany token (case-insensitive)
  const boxesForToken = (token) => {
    const t = token.toLowerCase();
    return words.filter(w => (w.text || '').toLowerCase().includes(t)).map(w => w.bbox);
  };

  // Zbuduj bbox dla zestawu boxów
  const unionBox = (boxes) => {
    if (!boxes || boxes.length === 0) return null;
    const minX = Math.min(...boxes.map(b => b.x));
    const minY = Math.min(...boxes.map(b => b.y));
    const maxX = Math.max(...boxes.map(b => b.x + b.w));
    const maxY = Math.max(...boxes.map(b => b.y + b.h));
    return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
  };

  // Znajdź anchor na podstawie słów kluczowych
  const findAnchorBox = (keywords) => {
    const boxes = keywords.flatMap(k => boxesForToken(k));
    return unionBox(boxes);
  };

  // Prosta heurystyka układu: dwie kolumny vs układ pionowy
  const detectLayout = () => {
    const sellerA = findAnchorBox(['sprzedawca', 'sprzedawcy', 'sprzed.', 'sprzed']);
    const buyerA = findAnchorBox(['nabywca', 'nabywcy']);
    if (sellerA && buyerA) {
      const dx = Math.abs((sellerA.x + sellerA.w / 2) - (buyerA.x + buyerA.w / 2));
      return dx > 0.25 ? 'two-columns' : 'stacked';
    }
    return 'unknown';
  };
  const layoutType = detectLayout();

  const getHoverTokens = () => {
    const list = activeTab === 'detected' ? fields : rawLines.map((txt, idx) => ({ id: `raw-${idx}`, value: txt }));
    const field = list.find(f => f.id === hoveredId);
    return tokensForField(field);
  };

  // Oblicz zbiorczy bbox dla aktualnie hoverowanego pola na podstawie słów OCR
  const computeFieldBBox = (field) => {
    const tokens = tokensForField(field);
    if (tokens.length === 0) return null;
    const matched = words.filter(w => tokens.some(t => (w.text || '').toLowerCase().includes(t)));
    if (matched.length === 0) return null;

    // Anchory i kontekst — ogranicz dopasowania do obszaru w sąsiedztwie właściwego anchoru
    const anchorConfig = {
      sellerName: { anchor: ['sprzedawca', 'sprzedawcy', 'sprzed.', 'sprzed'] },
      sellerAddress: { anchor: ['sprzedawca', 'sprzedawcy'] },
      sellerNIP: { anchor: ['sprzedawca', 'sprzedawcy', 'sprzed.', 'sprzed', 'nip', 'nip:'] },
      bdoNumber: { anchor: ['numer bdo', 'bdo', 'bdo:'] },
      sellerBankAccount: { anchor: ['bank', 'nr rachunku', 'nr rachunku:', 'rachunek', 'konto', 'nr konta', 'konto bankowe'] },
      buyerName: { anchor: ['nabywca', 'nabywcy'] },
      buyerAddress: { anchor: ['nabywca', 'nabywcy'] },
      buyerNIP: { anchor: ['nabywca', 'nabywcy', 'nip', 'nip:'] },
    };

    let limited = matched;
    const cfg = anchorConfig[field.id];
    const aBox = cfg ? findAnchorBox(cfg.anchor) : null;
    if (aBox) {
      // Rozszerz anchor box zgodnie z heurystyką układu
      const expandX = layoutType === 'two-columns' ? 0.20 : 0.35;
      const expandY = 0.20;
      const region = {
        x: Math.max(0, aBox.x - 0.02),
        y: Math.max(0, aBox.y - 0.01),
        w: Math.min(1, aBox.w + expandX),
        h: Math.min(1, aBox.h + expandY),
      };
      limited = matched.filter(w => {
        const cx = w.bbox.x + w.bbox.w / 2;
        const cy = w.bbox.y + w.bbox.h / 2;
        return cx >= region.x && cy >= region.y && cx <= (region.x + region.w) && cy <= (region.y + region.h);
      });
      if (limited.length === 0) limited = matched; // fallback
    }

    // Grupuj trafienia w linie na podstawie bliskości w osi Y
    const yThreshold = 0.03; // ~3% wysokości dla znormalizowanych współrzędnych
    const sorted = [...limited].sort((a, b) => a.bbox.y - b.bbox.y);
    const groups = [];
    let current = [];
    for (const w of sorted) {
      if (current.length === 0) {
        current.push(w);
      } else {
        const last = current[current.length - 1];
        if (Math.abs(w.bbox.y - last.bbox.y) <= yThreshold) {
          current.push(w);
        } else {
          groups.push(current);
          current = [w];
        }
      }
    }
    if (current.length > 0) groups.push(current);

    // Wybierz grupę o największej liczbie słów (najbardziej zwarty obszar)
    const best = groups.reduce((acc, g) => (g.length > (acc?.length || 0) ? g : acc), null);
    const useSet = best && best.length >= 2 ? best : limited; // fallback do ograniczonego zbioru

    const minX = Math.min(...useSet.map(w => w.bbox.x));
    const minY = Math.min(...useSet.map(w => w.bbox.y));
    const maxX = Math.max(...useSet.map(w => w.bbox.x + w.bbox.w));
    const maxY = Math.max(...useSet.map(w => w.bbox.y + w.bbox.h));
    return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
  };

  // Kopiowanie surowych wartości do schowka
  const handleCopy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      // ignoruj błędy kopiowania
    }
  };

  // Ocena jakości dopasowania — używane do oznaczeń wizualnych (niska jakość)
  const fieldQualityScore = (f) => {
    const tokens = tokensForField(f);
    if (tokens.length === 0) return 0;
    const matched = words.filter(w => tokens.some(t => (w.text || '').toLowerCase().includes(t)));
    const ratio = matched.length / tokens.length;
    const box = computeFieldBBox(f);
    const area = box ? box.w * box.h : 1;
    // Prosta metryka: preferujemy wyższy ratio i mniejszy area
    const sizePenalty = Math.min(1, area * 2);
    const score = Math.max(0, ratio - 0.2 * sizePenalty);
    return score;
  };

  const getHoveredFieldBBox = () => {
    const list = activeTab === 'detected' ? fields : rawLines.map((txt, idx) => ({ id: `raw-${idx}`, value: txt }));
    const field = list.find(f => f.id === hoveredId);
    return computeFieldBBox(field);
  };

  // Pomocniczo: przelicz bbox na wartości procentowe w zależności od jednostek (normowane vs piksele)
  const toPercentStyle = (box) => {
    if (!box) return null;
    const isNormalized = box.x <= 1 && box.y <= 1 && box.w <= 1 && box.h <= 1;
    const width = imgSize.width || (imgRef.current?.naturalWidth || 1);
    const height = imgSize.height || (imgRef.current?.naturalHeight || 1);
    const x = isNormalized ? box.x : box.x / width;
    const y = isNormalized ? box.y : box.y / height;
    const w = isNormalized ? box.w : box.w / width;
    const h = isNormalized ? box.h : box.h / height;
    return {
      left: `${x * 100}%`,
      top: `${y * 100}%`,
      width: `${w * 100}%`,
      height: `${h * 100}%`,
    };
  };

  const hasImage = Boolean(imageUrl);

  // Podziel pola na przypisane (matched) vs nieprzypisane (unmatched)
  const matchedFields = fields.filter(f => !f.unmatched);
  const unmatchedFields = fields.filter(f => f.unmatched);
  // Surowe linie jako pseudo‑pola dla trybu RAW
  const rawPseudoFields = rawLines.map((txt, idx) => ({ id: `raw-${idx}`, label: `Linia ${idx + 1}`, value: txt, unmatched: true }));
  const hasDetectedTab = matchedFields.length > 0 || unmatchedFields.length > 0;

  return (
    <div className={`grid grid-cols-1 ${hasImage ? 'md:grid-cols-2' : ''} gap-6`}>
      {/* Dokument z overlay boxami */}
      {hasImage && (
        <div className="flex flex-col items-center gap-2">
          {/* Kontrolki zoom */}
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.2))}
            >
              -
            </button>
            <span className="min-w-[60px] text-center">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="px-2 py-1 bg-slate-200 hover:bg-slate-300 rounded text-slate-700"
              onClick={() => setZoom(Math.min(3, zoom + 0.2))}
            >
              +
            </button>
            <button
              type="button"
              className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
              onClick={resetZoomPan}
            >
              Reset
            </button>
          </div>
          
          <div 
            ref={containerRef}
            className="relative max-h-[80vh] overflow-hidden touch-none border border-slate-200 rounded-md cursor-grab"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="relative inline-block"
              style={{
                transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                transformOrigin: 'center center',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                alt="Dokument"
                className="max-w-full h-auto block select-none"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setImgSize({ width: el.naturalWidth || 0, height: el.naturalHeight || 0 });
                }}
                draggable={false}
              />
          {/* Overlay boxy pól: w trybie pełnym rysuj grupowe boxy dla pól/RAW; w trybie "tylko słowa" pomijamy */}
          {overlayMode !== 'words_only' && (
            (activeTab === 'detected' ? fields : rawPseudoFields).map((f) => {
              const baseBox = f.bbox || computeFieldBBox(f);
              if (!baseBox) return null;
              const isHovered = hoveredId === f.id;
              const style = toPercentStyle(baseBox);
              const matchedStyle = isHovered ? 'border-blue-600 ring-2 ring-blue-500 bg-blue-200/30' : 'border-blue-400 ring-1 ring-blue-300 bg-blue-100/20';
              const unmatchedStyle = isHovered ? 'border-amber-600 ring-2 ring-amber-500 bg-amber-200/30' : 'border-amber-400 ring-1 ring-amber-300 bg-amber-100/20';
              return (
                <div
                  key={`field-${f.id}`}
                  className={`absolute border ${f.unmatched ? unmatchedStyle : matchedStyle} transition-colors`}
                  style={style}
                  onMouseEnter={() => handleEnter(f.id)}
                  onMouseLeave={handleLeave}
                  aria-label={f.label}
                  title={f.label}
                />
              );
            })
          )}

          {/* Overlay boxy dla słów OCR lub linii w zależności od trybu */}
          {overlayMode === 'lines' ? (
            // Tryb linii - grupuj słowa i rysuj delikatne ramki linii
            groupWordsIntoLines(words).map((lineWords, lineIdx) => {
              const lineBBox = getLineBBox(lineWords);
              if (!lineBBox) return null;
              const style = toPercentStyle(lineBBox);
              const lineText = lineWords.map(w => w.text).join(' ');
              return (
                <div
                  key={`line-${lineIdx}`}
                  className="absolute border border-purple-300 ring-1 ring-purple-200 bg-purple-50/20 hover:bg-purple-100/40 transition-colors"
                  style={style}
                  title={lineText}
                />
              );
            })
          ) : (
            // Tryb słów - rysuj ramki dla pojedynczych słów
            words.map((w, idx) => {
              const tokens = getHoverTokens();
              const match = tokens.length > 0 && tokens.some(t => (w.text || '').toLowerCase().includes(t));
              const style = toPercentStyle(w.bbox);
              const baseStyle = match
                ? 'border-emerald-600 ring-2 ring-emerald-500 bg-emerald-100/50'
                : 'border-emerald-500 ring-1 ring-emerald-400 bg-emerald-100/25';
              return (
                <div
                  key={`w-${idx}`}
                  className={`absolute border ${baseStyle} transition-colors`}
                  style={style}
                  title={w.text}
                />
              );
            })
          )}

          {/* Zbiorczy bbox dla aktualnie zaznaczonego pola/wiersza (aktywny tylko, gdy mamy źródło hoveru) */}
          {(() => {
            const box = getHoveredFieldBBox();
            if (!box) return null;
            const style = toPercentStyle(box);
            return (
              <div
                className="absolute border-2 border-blue-600 ring-2 ring-blue-400/70 bg-blue-200/20 transition-colors"
                style={style}
                aria-label="Zaznaczenie pola"
              />
            );
          })()}
            </div>
          </div>
        </div>
      )}

      {/* Panel z zakładkami */}
      <div className="border border-slate-200 rounded-md p-4 bg-white">
        {/* Przełącznik trybu overlay */}
        {hasImage && (
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <span className="text-sm text-slate-600 font-medium">Tryb wyświetlania:</span>
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded ${overlayMode === 'fields_and_words' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} transition-colors`}
              onClick={() => setOverlayMode('fields_and_words')}
            >
              Pola + słowa
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded ${overlayMode === 'words_only' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} transition-colors`}
              onClick={() => setOverlayMode('words_only')}
            >
              Tylko słowa
            </button>
            <button
              type="button"
              className={`px-3 py-1 text-xs rounded ${overlayMode === 'lines' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'} transition-colors`}
              onClick={() => setOverlayMode('lines')}
            >
              Wiersze
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 mb-3 border-b pb-2">
          {hasDetectedTab && (
            <button
              type="button"
              className={`px-3 py-1 rounded ${activeTab === 'detected' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}
              onClick={() => setActiveTab('detected')}
            >
              Wykryte pola
            </button>
          )}
          <button
            type="button"
            className={`px-3 py-1 rounded ${activeTab === 'raw' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}
            onClick={() => setActiveTab('raw')}
          >
            Wszystkie wykryte wartości
          </button>
        </div>

        {activeTab === 'detected' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Wykryte pola</h2>
            <ul className="space-y-2">
              {matchedFields.map((f) => {
                const isHovered = hoveredId === f.id;
                const q = fieldQualityScore(f);
                const low = q < 0.4;
                return (
                  <li
                    key={f.id}
                    className={`p-2 rounded-md border ${isHovered ? 'bg-blue-50 border-blue-400' : 'bg-white border-slate-200'} ${low ? 'ring-1 ring-amber-300' : ''} transition-colors`}
                    onMouseEnter={() => handleEnter(f.id)}
                    onMouseLeave={handleLeave}
                    aria-label={`${f.label}: ${f.value}`}
                    title={f.label}
                  >
                    <div className="text-xs text-slate-500">{f.label}</div>
                    <div className="text-sm font-medium text-slate-900">{f.value}</div>
                    {low && (<div className="text-[10px] text-amber-700 mt-1">Niska jakość dopasowania</div>)}
                  </li>
                );
              })}
            </ul>

            {unmatchedFields.length > 0 && (
              <>
                <h3 className="text-md font-semibold text-slate-800 mt-5 mb-2">Brak pasującego pola</h3>
                <ul className="space-y-2">
                  {unmatchedFields.map((f) => {
                    const isHovered = hoveredId === f.id;
                    return (
                      <li
                        key={f.id}
                        className={`p-2 rounded-md border ${isHovered ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200'} transition-colors`}
                        onMouseEnter={() => handleEnter(f.id)}
                        onMouseLeave={handleLeave}
                        aria-label={`${f.label}: ${f.value}`}
                        title={f.label}
                      >
                        <div className="text-xs text-slate-500">{f.label}</div>
                        <div className="text-sm font-medium text-slate-900">{f.value}</div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}

        {activeTab === 'raw' && (
          <>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Wszystkie wykryte wartości</h2>
            <ul className="space-y-2">
              {rawPseudoFields.map((f) => {
                const isHovered = hoveredId === f.id;
                return (
                  <li
                    key={f.id}
                    className={`p-2 rounded-md border ${isHovered ? 'bg-amber-50 border-amber-400' : 'bg-white border-slate-200'} transition-colors`}
                    onMouseEnter={() => handleEnter(f.id)}
                    onMouseLeave={handleLeave}
                    aria-label={`${f.label}: ${f.value}`}
                    title={f.label}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs text-slate-500">{f.label}</div>
                        <div className="text-sm font-medium text-slate-900">{f.value}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center p-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          onClick={() => handleCopy(f.value, f.id)}
                          aria-label={`Kopiuj: ${f.value}`}
                          title="Kopiuj"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            className="w-4 h-4"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M16 1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h2V5a2 2 0 0 1 2-2h8V1z" />
                            <path d="M20 5H8a2 2 0 0 0-2 2v14h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                          </svg>
                        </button>
                        {copiedId === f.id && (
                          <span className="text-[10px] text-emerald-600">Skopiowano</span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};

export default OcrViewer;