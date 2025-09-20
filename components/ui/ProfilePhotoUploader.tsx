"use client"

import { useState, useRef, useCallback } from 'react'
import { Camera, Upload, X, Trash2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { uploadProfilePhoto, deleteProfilePhoto } from '@/lib/actions/photo.actions'
import Image from 'next/image'

interface ProfilePhotoUploaderProps {
  currentPhotoUrl?: string | null
  onPhotoChange?: (newPhotoUrl: string | null) => void
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function ProfilePhotoUploader({ 
  currentPhotoUrl, 
  onPhotoChange, 
  className = "",
  size = 'md'
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
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        const MAX_SIZE = 800
        let { width, height } = img
        
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

        canvas.width = width
        canvas.height = height
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
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
          0.8
        )
      }

      img.onerror = () => reject(new Error('Error al cargar la imagen'))
      img.src = URL.createObjectURL(file)
    })
  }, [])

  // Manejar subida de archivo
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      setIsUploading(true)
      setError(null)

      // Procesar imagen
      const processedFile = await processImageFile(file)

      // Crear FormData
      const formData = new FormData()
      formData.append('photo', processedFile)

      // Subir foto
      const result = await uploadProfilePhoto(formData)

      if (result.success && result.photoUrl) {
        setPreviewUrl(result.photoUrl)
        onPhotoChange?.(result.photoUrl)
      } else {
        setError(result.error || 'Error al subir la foto')
      }
    } catch (err) {
      console.error('Error al subir foto:', err)
      setError('Error al procesar la imagen')
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user' // Cámara frontal por defecto
        } 
      })
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
        setShowCamera(true)
      }
    } catch (err) {
      console.error('Error al acceder a la cámara:', err)
      setError('No se pudo acceder a la cámara')
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
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    ctx?.drawImage(video, 0, 0)

    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], 'camera-photo.jpg', {
          type: 'image/jpeg',
          lastModified: Date.now()
        })
        
        stopCamera()
        await handleFileUpload(file)
      }
    }, 'image/jpeg', 0.8)
  }, [stopCamera, handleFileUpload])

  // Eliminar foto
  const handleDeletePhoto = useCallback(async () => {
    try {
      setIsUploading(true)
      setError(null)

      const result = await deleteProfilePhoto()

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
            Arrastra una imagen o haz clic para seleccionar
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

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startCamera}
          disabled={isUploading}
          className="flex items-center gap-2"
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

      {/* Input de archivo oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Modal de cámara */}
      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Tomar foto</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={stopCamera}
                className="p-1"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full rounded-lg"
              />
              
              <div className="flex justify-center gap-2">
                <Button
                  onClick={capturePhoto}
                  disabled={isUploading}
                  className="flex items-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Capturar
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
            Subiendo foto...
          </div>
        </div>
      )}
    </div>
  )
}
