import React, { useState, useCallback, ChangeEvent, useRef } from 'react';
import { editImage, verifyImageSafety } from './services/geminiService';

// --- Helper Types ---
interface OriginalImage {
  dataUrl: string;
  base64: string;
  mimeType: string;
}

// --- Constants ---
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// --- Helper Functions ---
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('FileReader result is not a string'));
      }
      resolve(reader.result);
    };
    reader.onerror = (error) => reject(error);
  });

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        return reject(new Error('FileReader result is not a string'));
      }
      resolve(reader.result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });

/**
 * Sanitizes a string by removing HTML tags.
 * This helps prevent XSS and prompt injection attacks.
 * @param input The string to sanitize.
 * @returns The sanitized string.
 */
const sanitizePrompt = (input: string): string => {
  return input.replace(/<[^>]*>?/gm, '');
};


// --- SVG Icon Components (defined outside App to prevent re-creation) ---
const UploadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
  </svg>
);

const SparklesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" />
  </svg>
);

const PhotoIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
);

const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.134-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.067-2.09 1.02-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
  </svg>
);


// --- Main App Component ---
export default function App() {
  const [originalImage, setOriginalImage] = useState<OriginalImage | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setOriginalImage(null);
    setGeneratedImage(null);
    setPrompt('');
    setError(null);
    setIsLoading(false);
    setIsVerifying(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    
    // Reset previous state for a new session
    setGeneratedImage(null);
    setOriginalImage(null);
    setError(null);
    setPrompt('');
    
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Por favor, sube un archivo de imagen válido.');
        return;
      }
      
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`El archivo es demasiado grande. El tamaño máximo es de ${MAX_FILE_SIZE_MB} MB.`);
        return;
      }

      setIsVerifying(true);

      try {
        const base64 = await fileToBase64(file);
        await verifyImageSafety(base64, file.type);
        
        const dataUrl = await fileToDataUrl(file);
        setOriginalImage({ dataUrl, base64, mimeType: file.type });

      } catch (err) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError('Ocurrió un error desconocido al procesar la imagen.');
        }
        console.error(err);
      } finally {
        setIsVerifying(false);
      }
    }
  }, []);

  const handleSubmit = async () => {
    if (!originalImage || !prompt) {
      setError('Por favor, sube una imagen y escribe una instrucción.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const sanitizedPrompt = sanitizePrompt(prompt);
      if (!sanitizedPrompt.trim()) {
        setError('La instrucción no puede estar vacía después de la sanitización.');
        setIsLoading(false);
        return;
      }

      const resultBase64 = await editImage(sanitizedPrompt, originalImage.base64, originalImage.mimeType);
      setGeneratedImage(`data:image/png;base64,${resultBase64}`);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error desconocido.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const isFormSubmittable = !isLoading && !isVerifying && !!originalImage && prompt.trim().length > 0;

  return (
    <div className="min-h-screen text-gray-800 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8 md:mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold" style={{ color: '#0072B5' }}>
            EDITOR DEL ESTERO
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Transforma tus imágenes con el poder de Gemini.
          </p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col gap-6 h-fit">
            <div>
              <h2 className="text-2xl font-bold mb-1 text-gray-900">1. Sube tu Imagen</h2>
              <p className="text-gray-600 text-sm">Comienza seleccionando una imagen (máx {MAX_FILE_SIZE_MB}MB).</p>
               <p className="text-xs text-gray-500 mt-1">
                <strong>Privacidad:</strong> Tus imágenes se procesan en el navegador y no se guardan en ningún servidor.
              </p>
            </div>

            <label
              htmlFor="file-upload"
              className="relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-gray-50 transition-colors"
            >
              {isVerifying ? (
                <div className="flex flex-col items-center justify-center text-center">
                  <svg className="animate-spin h-10 w-10 text-blue-600 mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="font-semibold text-gray-700">Verificando imagen...</p>
                  <p className="text-xs text-gray-500">Asegurando un contenido seguro.</p>
                </div>
              ) : originalImage ? (
                <img src={originalImage.dataUrl} alt="Preview" className="object-contain h-full w-full rounded-lg" />
              ) : (
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadIcon className="w-10 h-10 mb-3 text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Haz clic para subir</span> o arrastra y suelta</p>
                  <p className="text-xs text-gray-400">PNG, JPG, WEBP, etc.</p>
                </div>
              )}
              <input ref={fileInputRef} id="file-upload" type="file" className="hidden" onChange={handleFileChange} accept="image/*" disabled={isVerifying} />
            </label>

            <div>
              <h2 className="text-2xl font-bold mb-1 text-gray-900">2. Describe la Edición</h2>
              <p className="text-gray-600 text-sm">Dile a la IA qué quieres cambiar. Ej: "Añade un filtro retro".</p>
            </div>
            
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Convierte el cielo en una galaxia..."
              className="w-full h-24 p-3 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all resize-none disabled:opacity-50"
              disabled={!originalImage || isVerifying}
            />

            <button
              onClick={handleSubmit}
              disabled={!isFormSubmittable}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold text-white rounded-lg shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 disabled:scale-100"
              style={{ backgroundColor: isFormSubmittable ? '#0072B5' : '' }}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" />
                  Generar Imagen
                </>
              )}
            </button>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center min-h-[400px] lg:min-h-full">
            <div className="w-full h-full flex items-center justify-center">
              {isLoading && (
                <div className="w-full max-w-md animate-pulse">
                  <div className="w-full aspect-square bg-gray-200 rounded-lg"></div>
                  <div className="h-4 bg-gray-300 rounded-full w-3/4 mt-4 mx-auto"></div>
                </div>
              )}

              {!isLoading && error && (
                <div className="text-center p-4 border-2 border-dashed border-red-300 rounded-lg text-red-700 bg-red-50">
                  <h3 className="font-bold text-lg mb-2">Ocurrió un Error</h3>
                  <p className="text-sm">{error}</p>
                </div>
              )}

              {!isLoading && !error && generatedImage && (
                <div className="w-full text-center">
                    <img src={generatedImage} alt="Resultado generado" className="w-full h-auto object-contain rounded-lg shadow-lg border border-gray-200" />
                    <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
                      <a
                        href={generatedImage}
                        download="editado-por-estero.png"
                        onClick={resetState}
                        className="flex items-center justify-center gap-2 px-5 py-2 font-semibold text-white rounded-lg shadow-md transition-all duration-300 transform hover:scale-105"
                        style={{ backgroundColor: '#0072B5' }}
                      >
                        <DownloadIcon className="w-5 h-5" />
                        Descargar Imagen
                      </a>
                      <button
                        onClick={resetState}
                        className="flex items-center justify-center gap-2 px-5 py-2 font-semibold text-gray-700 bg-gray-200 rounded-lg shadow-md hover:bg-gray-300 transition-all duration-300 transform hover:scale-105"
                      >
                        <TrashIcon className="w-5 h-5" />
                        Comenzar de Nuevo
                      </button>
                    </div>
                </div>
              )}

              {!isLoading && !error && !generatedImage && (
                <div className="text-center text-gray-500">
                  <PhotoIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-xl font-semibold text-gray-700">Tu imagen editada aparecerá aquí</h3>
                  <p className="mt-1">Sigue los pasos de la izquierda para comenzar.</p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}