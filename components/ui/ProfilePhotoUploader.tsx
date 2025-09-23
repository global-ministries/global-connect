"use client"

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadProfilePhoto, deleteProfilePhoto, uploadUserProfilePhoto, deleteUserProfilePhoto } from '@/lib/actions/photo.actions'
import Image from 'next/image'

interface ProfilePhotoUploaderProps {
  currentPhotoUrl?: string | null
  onPhotoChange?: (newPhotoUrl: string | null) => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
  userId?: string // ID del usuario cuya foto se está editando (opcional)
}

export function ProfilePhotoUploader({ 
  currentPhotoUrl, 
  onPhotoChange, 
  className = "",
  size = 'md',
  userId
}: ProfilePhotoUploaderProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl || null)
  const [showCamera, setShowCamera] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Configuraciones de tamaño
  const sizeConfig = {
    sm: { container: 'w-20 h-20', text: 'text-xs', icon: 'w-4 h-4' },
    md: { container: 'w-32 h-32', text: 'text-sm', icon: 'w-5 h-5' },
    lg: { container: 'w-48 h-48', text: 'text-base', icon: 'w-6 h-6' }
  }

  const config = sizeConfig[size]

  // Procesar archivo de imagen
  const processImageFile = useCallback(async (file: File): Promise<File> => {
    // Verificar que estamos en el cliente
    if (typeof window === 'undefined') {
      return Promise.reject(new Error('El procesamiento de imágenes solo está disponible en el cliente'))
    }

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        reject(new Error('No se pudo crear el contexto del canvas'))
        return
      }

      const img = document.createElement('img') as HTMLImageElement

      img.onload = () => {
        try {
          // Detectar si es móvil para compresión más agresiva
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
          
          // Configuración de compresión basada en el dispositivo y tamaño original
          let MAX_SIZE = 800
          let quality = 0.8
          
          // Configuración agresiva para asegurar que siempre sea < 1MB
          if (isMobile || file.size > 2 * 1024 * 1024) {
            // Para móviles o archivos grandes, comprimir agresivamente
            MAX_SIZE = 300 // Muy pequeño
            quality = 0.4  // Calidad baja para tamaño pequeño
            console.log('Aplicando compresión agresiva para asegurar < 1MB')
          }
          
          // Si el archivo original es enorme, ser extremadamente agresivo
          if (file.size > 5 * 1024 * 1024) { // Mayor a 5MB
            MAX_SIZE = 200 // Extremadamente pequeño
            quality = 0.3  // Calidad muy baja
            console.log('Archivo enorme, aplicando compresión extrema')
          }
          
          let { width, height } = img
          console.log('Dimensiones originales:', width, 'x', height)
          
          // Redimensionar manteniendo aspect ratio
          if (width > height) {
            if (width > MAX_SIZE) {
              height = (height * MAX_SIZE) / width
              width = MAX_SIZE
            }
          } else {
            if (height > MAX_SIZE) {
              width = (width * MAX_SIZE) / height
              height = MAX_SIZE
            }
          }

          console.log('Dimensiones finales:', width, 'x', height)
          console.log('Calidad JPEG:', quality)

          canvas.width = width
          canvas.height = height
          ctx.drawImage(img, 0, 0, width, height)

          canvas.toBlob(
            (blob) => {
              // Limpiar URL del objeto
              URL.revokeObjectURL(img.src)
              
              if (blob) {
                console.log('Blob creado:', blob.size, 'bytes')
                const processedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now()
                })
                resolve(processedFile)
              } else {
                reject(new Error('Error al procesar la imagen'))
              }
            },
            'image/jpeg',
            quality
          )
        } catch (error) {
          URL.revokeObjectURL(img.src)
          reject(new Error('Error al procesar la imagen: ' + (error as Error).message))
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(img.src)
        reject(new Error('Error al cargar la imagen'))
      }

      try {
        img.src = URL.createObjectURL(file)
      } catch (error) {
        reject(new Error('Error al crear URL del archivo'))
      }
    })
  }, [])

  // Manejar subida de archivo
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setIsUploading(true)
      setError(null)

      // Validar archivo antes de procesar
      if (!file.type.startsWith('image/')) {
        setError('Por favor selecciona un archivo de imagen válido')
        return
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB
        setError('El archivo es demasiado grande. Máximo permitido: 5MB.')
        return
      }

      let fileToUpload = file

      // Detectar si es móvil para compresión más agresiva
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      
      // Procesar imagen si es muy grande o si es de móvil (las fotos móviles suelen ser enormes)
      const shouldCompress = file.size > 1024 * 1024 || // Mayor a 1MB
                            isMobile || // Siempre comprimir en móvil
                            !file.type.includes('jpeg') // No es JPEG
      
      console.log('Archivo original:', file.name, file.size, 'bytes')
      console.log('Es móvil:', isMobile)
      console.log('Debe comprimir:', shouldCompress)
      
      if (shouldCompress) {
        try {
          console.log('Iniciando compresión...')
          setError('Comprimiendo imagen, por favor espera...')
          
          // Timeout para evitar que se cuelgue
          const compressionPromise = processImageFile(file)
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Timeout de compresión')), 30000) // 30 segundos
          })
          
          fileToUpload = await Promise.race([compressionPromise, timeoutPromise])
          
          console.log('Archivo comprimido:', fileToUpload.size, 'bytes')
          console.log('Reducción:', Math.round((1 - fileToUpload.size / file.size) * 100) + '%')
          setError(null) // Limpiar mensaje de compresión
        } catch (processError) {
          console.warn('Error al procesar imagen, usando archivo original:', processError)
          setError(null)
          
          // Si falla el procesamiento y el archivo original es muy grande, rechazar
          if (file.size > 5 * 1024 * 1024) {
            setError(`La imagen es muy grande (${Math.round(file.size / 1024 / 1024)}MB) y no se pudo comprimir. Intenta con una foto más pequeña.`)
            return
          }
          
          // Si el archivo original es aceptable, usarlo
          fileToUpload = file
        }
      }

      // Verificación final de tamaño después de compresión
      if (fileToUpload.size > 1024 * 1024) { // 1MB límite para Server Actions
        setError(`La imagen aún es muy grande (${Math.round(fileToUpload.size / 1024)}KB). Límite: 1MB. Intenta con una foto más pequeña o de menor calidad.`)
        return
      }
      
      if (fileToUpload.size > 5 * 1024 * 1024) {
        setError(`La imagen sigue siendo muy grande después de la compresión (${Math.round(fileToUpload.size / 1024 / 1024)}MB). Intenta con una foto más pequeña.`)
        return
      }

      console.log('Archivo final para subir:', fileToUpload.size, 'bytes')

      // Crear FormData
      const formData = new FormData()
      formData.append('photo', fileToUpload)

      // Subir foto - usar función específica si se proporciona userId
      const result = userId 
        ? await uploadUserProfilePhoto(formData, userId)
        : await uploadProfilePhoto(formData)

      if (result.success && result.photoUrl) {
        setPreviewUrl(result.photoUrl)
        onPhotoChange?.(result.photoUrl)
      } else {
        setError(result.error || 'Error al subir la foto')
      }
    } catch (err) {
      console.error('Error al subir foto:', err)
      setError('Error al subir la foto')
    } finally {
      setIsUploading(false)
    }
  }, [processImageFile, onPhotoChange])

  // Manejar selección de archivo
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  // Manejar drag & drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      handleFileUpload(file)
    }
  }, [handleFileUpload])

  // Iniciar cámara
  const startCamera = useCallback(async () => {
    try {
      setError(null)
      
      // Verificar compatibilidad del navegador
      if (typeof navigator === 'undefined') {
        setError('Funcionalidad no disponible en este entorno')
        return
      }

      // Detectar si es móvil
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
      console.log('Es móvil:', isMobile)
      console.log('User Agent:', navigator.userAgent)

      // Verificar compatibilidad específica para móviles
      let hasCamera = false
      let cameraMethod = 'none'
      
      // Para móviles, verificar de manera más específica
      if (isMobile) {
        console.log('=== VERIFICACIÓN MÓVIL ===')
        
        // Verificar si navigator.mediaDevices existe
        if (navigator.mediaDevices) {
          console.log('✅ navigator.mediaDevices existe')
          
          if (typeof navigator.mediaDevices.getUserMedia === 'function') {
            console.log('✅ navigator.mediaDevices.getUserMedia existe')
            hasCamera = true
            cameraMethod = 'modern'
          } else {
            console.log('❌ navigator.mediaDevices.getUserMedia NO existe')
          }
        } else {
          console.log('❌ navigator.mediaDevices NO existe')
          
          // Fallback para móviles antiguos
          if ((navigator as any).getUserMedia) {
            console.log('✅ navigator.getUserMedia existe (legacy)')
            hasCamera = true
            cameraMethod = 'legacy'
          } else if ((navigator as any).webkitGetUserMedia) {
            console.log('✅ navigator.webkitGetUserMedia existe (webkit)')
            hasCamera = true
            cameraMethod = 'webkit'
          } else {
            console.log('❌ No hay métodos getUserMedia disponibles')
          }
        }
      } else {
        // Para desktop, usar verificación normal
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          hasCamera = true
          cameraMethod = 'modern'
          console.log('✅ Método moderno disponible (desktop)')
        } else if (typeof (navigator as any).getUserMedia === 'function') {
          hasCamera = true
          cameraMethod = 'legacy'
          console.log('✅ Método legacy disponible (desktop)')
        } else if (typeof (navigator as any).webkitGetUserMedia === 'function' || typeof (navigator as any).mozGetUserMedia === 'function') {
          hasCamera = true
          cameraMethod = 'webkit'
          console.log('✅ Método con prefijo disponible (desktop)')
        }
      }
      
      console.log('Método de cámara detectado:', cameraMethod)
      
      if (!hasCamera) {
        if (isMobile) {
          // En móvil, ofrecer alternativa con input file
          setError('Tu navegador móvil no soporta cámara web. Usa el botón "Subir archivo" para seleccionar una foto de tu galería.')
        } else {
          setError('Tu navegador no soporta acceso a la cámara. Asegúrate de usar Chrome, Firefox o Safari actualizado.')
        }
        return
      }

      console.log('Abriendo modal de cámara...')
      
      // Primero mostrar el modal
      setShowCamera(true)
      
      // Esperar un poco para que el modal se renderice
      await new Promise(resolve => setTimeout(resolve, 200))
      
      console.log('Solicitando acceso a la cámara...')
      console.log('Navigator disponible:', !!navigator)
      console.log('MediaDevices disponible:', !!navigator.mediaDevices)
      console.log('getUserMedia disponible:', !!navigator.mediaDevices?.getUserMedia)
      
      // Configuraciones específicas para móvil vs desktop
      let constraints: MediaStreamConstraints
      
      if (isMobile) {
        // Configuración optimizada para móviles
        constraints = {
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            facingMode: 'user', // Cámara frontal
            frameRate: { ideal: 30, max: 30 }
          },
          audio: false
        }
        console.log('Usando configuración móvil:', constraints)
      } else {
        // Configuración simple para desktop
        constraints = {
          video: true,
          audio: false
        }
        console.log('Usando configuración desktop:', constraints)
      }
      
      console.log('Constraints:', constraints)
      
      let stream: MediaStream
      
      try {
        if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
          console.log('Usando método moderno getUserMedia...')
          stream = await navigator.mediaDevices.getUserMedia(constraints)
          console.log('Stream obtenido:', stream)
          console.log('Video tracks:', stream.getVideoTracks().length)
        } else if (typeof (navigator as any).getUserMedia === 'function') {
          console.log('Usando fallback navigator.getUserMedia...')
          stream = await new Promise<MediaStream>((resolve, reject) => {
            (navigator as any).getUserMedia(constraints, resolve, reject)
          })
        } else if (typeof (navigator as any).webkitGetUserMedia === 'function') {
          console.log('Usando fallback webkitGetUserMedia...')
          stream = await new Promise<MediaStream>((resolve, reject) => {
            (navigator as any).webkitGetUserMedia(constraints, resolve, reject)
          })
        } else if (typeof (navigator as any).mozGetUserMedia === 'function') {
          console.log('Usando fallback mozGetUserMedia...')
          stream = await new Promise<MediaStream>((resolve, reject) => {
            (navigator as any).mozGetUserMedia(constraints, resolve, reject)
          })
        } else {
          throw new Error('No se encontró método getUserMedia compatible')
        }
      } catch (streamError) {
        console.error('Error al obtener stream:', streamError)
        throw streamError
      }
      
      console.log('Acceso a cámara concedido, configurando video...')
      
      // Esperar a que el videoRef esté disponible con más intentos
      let attempts = 0
      while (!videoRef.current && attempts < 20) {
        console.log(`Esperando videoRef, intento ${attempts + 1}/20`)
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }
      
      if (videoRef.current) {
        console.log('VideoRef encontrado, asignando stream...')
        videoRef.current.srcObject = stream
        streamRef.current = stream
        
        // Configurar eventos del video
        videoRef.current.onloadedmetadata = () => {
          console.log('Video metadata loaded - dimensiones:', videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight)
        }
        
        videoRef.current.oncanplay = () => {
          console.log('Video can play')
        }
        
        videoRef.current.onplay = () => {
          console.log('Video started playing')
        }
        
        videoRef.current.onerror = (e) => {
          console.error('Video element error:', e)
          setError('Error en el elemento de video')
        }
        
        // Forzar reproducción
        try {
          console.log('Intentando reproducir video...')
          await videoRef.current.play()
          console.log('Video reproduciéndose correctamente')
        } catch (playError) {
          console.warn('No se pudo auto-reproducir el video:', playError)
          // No es crítico, el video puede funcionar sin autoplay
        }
      } else {
        console.error('videoRef.current sigue siendo null después de 20 intentos')
        setError('Error interno: no se pudo inicializar el video después de múltiples intentos.')
        
        // Limpiar el stream si no podemos usarlo
        stream.getTracks().forEach(track => track.stop())
        setShowCamera(false)
      }
    } catch (err) {
      console.error('Error al acceder a la cámara:', err)
      setShowCamera(false)
      
      // Mensajes de error más específicos
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Permisos de cámara denegados. Por favor, permite el acceso a la cámara en tu navegador.')
        } else if (err.name === 'NotFoundError') {
          setError('No se encontró ninguna cámara en tu dispositivo.')
        } else if (err.name === 'NotSupportedError') {
          setError('Tu navegador no soporta acceso a la cámara. Prueba con Chrome, Firefox o Safari.')
        } else if (err.name === 'NotReadableError') {
          setError('La cámara está siendo usada por otra aplicación.')
        } else if (err.name === 'OverconstrainedError') {
          setError('La configuración de cámara solicitada no es compatible con tu dispositivo.')
        } else {
          setError(`Error de cámara: ${err.message}`)
        }
      } else {
        setError('Error desconocido al acceder a la cámara')
      }
    }
  }, [])

  // Detener cámara
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }, [])

  // Tomar foto con cámara
  const capturePhoto = useCallback(async () => {
    console.log('=== CAPTURANDO FOTO ===')
    
    if (!videoRef.current) {
      console.error('videoRef.current es null')
      setError('Error: elemento de video no disponible')
      return
    }
    
    if (!canvasRef.current) {
      console.error('canvasRef.current es null')
      setError('Error: elemento canvas no disponible')
      return
    }

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      console.error('No se pudo obtener contexto 2D del canvas')
      setError('Error: no se pudo crear contexto de canvas')
      return
    }

    console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight)
    
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('Video no tiene dimensiones válidas')
      setError('Error: video no está listo. Espera un momento e intenta de nuevo.')
      return
    }

    // Configurar canvas con las dimensiones del video
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    
    console.log('Canvas configurado:', canvas.width, 'x', canvas.height)

    // Dibujar el frame actual del video en el canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    
    console.log('Frame dibujado en canvas')

    // Convertir canvas a blob
    try {
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      })

      if (!blob) {
        console.error('No se pudo crear blob desde canvas')
        setError('Error al procesar la imagen capturada')
        return
      }

      console.log('Blob creado:', blob.size, 'bytes')

      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now()
      })
      
      console.log('Archivo creado:', file.name, file.size, 'bytes')
      
      // Cerrar cámara antes de subir
      stopCamera()
      
      // Subir archivo
      console.log('Iniciando subida de archivo...')
      await handleFileUpload(file)
      
    } catch (error) {
      console.error('Error en captura de foto:', error)
      setError('Error al capturar la foto')
    }
  }, [stopCamera, handleFileUpload])

  // Eliminar foto
  const handleDeletePhoto = useCallback(async () => {
    try {
      setIsUploading(true)
      setError(null)

      // Eliminar foto - usar función específica si se proporciona userId
      const result = userId 
        ? await deleteUserProfilePhoto(userId)
        : await deleteProfilePhoto()

      if (result.success) {
        setPreviewUrl(null)
        onPhotoChange?.(null)
      } else {
        setError(result.error || 'Error al eliminar la foto')
      }
    } catch (err) {
      console.error('Error al eliminar foto:', err)
      setError('Error al eliminar la foto')
    } finally {
      setIsUploading(false)
    }
  }, [onPhotoChange])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Vista previa de foto actual */}
      <div className="flex flex-col items-center space-y-4">
        <div
          className={`${config.container} rounded-full border-4 border-gray-200 overflow-hidden bg-gray-100 relative group cursor-pointer ${
            isDragging ? 'border-orange-500 bg-orange-50' : ''
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Foto de perfil"
              fill
              className="object-cover"
              sizes={size === 'lg' ? '192px' : size === 'md' ? '128px' : '80px'}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Upload className={`${config.icon} text-gray-400`} />
            </div>
          )}
          
          {/* Overlay al hacer hover */}
          <div className="absolute inset-0 bg-black bg-opacity-50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Upload className={`${config.icon} text-white`} />
          </div>
        </div>

        {/* Texto de instrucciones */}
        <div className="text-center">
          <p className={`${config.text} text-gray-600 font-medium`}>
            {previewUrl ? 'Cambiar foto' : 'Subir foto de perfil'}
          </p>
          <p className={`${config.text} text-gray-400`}>
            <span className="hidden md:inline">Arrastra una imagen o </span>
            Haz clic para seleccionar
            <span className="md:hidden"> de tu galería</span>
          </p>
          <p className={`text-xs text-gray-500 mt-1`}>
            Máximo 5MB • Formatos: JPG, PNG, WebP
          </p>
          <p className={`text-xs text-gray-400 mt-1`}>
            Las imágenes se optimizan automáticamente para web
          </p>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Subir archivo
        </Button>

        {/* Botón de cámara - solo en desktop */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            console.log('Botón de cámara clickeado')
            startCamera()
          }}
          disabled={isUploading}
          className="hidden md:flex items-center gap-2" // Solo visible en desktop
        >
          <Camera className="w-4 h-4" />
          Usar cámara
        </Button>


        {previewUrl && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeletePhoto}
            disabled={isUploading}
            className="flex items-center gap-2 text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4" />
            Eliminar
          </Button>
        )}
      </div>

      {/* Input de archivo oculto - optimizado para móviles */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        // Removemos capture para que solo abra galería en móvil
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Modal de cámara */}
      {showCamera && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999]"
          style={{ zIndex: 9999 }}
        >
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Tomar foto de perfil</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={stopCamera}
                className="p-1 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="space-y-4">
              {/* Contenedor del video con aspect ratio */}
              <div className="relative bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => {
                    console.log('Video metadata loaded')
                  }}
                  onError={(e) => {
                    console.error('Video error:', e)
                    setError('Error al cargar el video de la cámara')
                  }}
                />
                
                {/* Indicador de carga mientras se inicia la cámara */}
                {!streamRef.current && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                    <div className="text-center">
                      <RotateCcw className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-500" />
                      <p className="text-sm text-gray-600">Iniciando cámara...</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Si aparece una solicitud de permisos, por favor acepta
                      </p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-center gap-3">
                <Button
                  onClick={capturePhoto}
                  disabled={isUploading || !videoRef.current?.srcObject}
                  className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600"
                >
                  <Camera className="w-4 h-4" />
                  {isUploading ? 'Procesando...' : 'Capturar foto'}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={stopCamera}
                  className="flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancelar
                </Button>
              </div>
              
              {/* Instrucciones */}
              <div className="text-center">
                <p className="text-xs text-gray-500">
                  Asegúrate de estar bien iluminado y centrado en la cámara
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Canvas oculto para captura */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Mensaje de error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm text-center">{error}</p>
        </div>
      )}

      {/* Indicador de carga */}
      {isUploading && (
        <div className="text-center">
          <div className="inline-flex items-center gap-2 text-sm text-gray-600">
            <RotateCcw className="w-4 h-4 animate-spin" />
            Procesando y subiendo foto...
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Optimizando imagen para web (puede tomar unos segundos)
          </p>
        </div>
      )}
    </div>
  )
}
