import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Proyecto } from './Proyectos'

interface SwipeableProjectCardProps {
  proyecto: Proyecto
  tipoInfo: {
    icon: string
    label: string
    desc: string
  }
  fechaRelativa: string
  onSelect: (p: Proyecto) => void
  onEdit: (p: Proyecto, e: React.MouseEvent) => void
  onDelete: (p: Proyecto) => void
}

const ACTION_WIDTH = 84
const THRESHOLD_SNAP = 45
const THRESHOLD_FULL_DELETE = 160

export const SwipeableProjectCard: React.FC<SwipeableProjectCardProps> = ({
  proyecto,
  tipoInfo,
  fechaRelativa,
  onSelect,
  onEdit,
  onDelete
}) => {
  const [translateX, setTranslateX] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isSwiping, setIsSwiping] = useState(false)

  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const currentXRef = useRef(0)
  const isHorizontalSwipeRef = useRef<boolean | null>(null)
  const isDraggingRef = useRef(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Resetear swipe si se hace click fuera
  useEffect(() => {
    const handleWindowClick = (e: MouseEvent | TouchEvent) => {
      if (isOpen && cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setTranslateX(0)
        setIsOpen(false)
      }
    }

    window.addEventListener('touchstart', handleWindowClick, { passive: true })
    window.addEventListener('mousedown', handleWindowClick)
    return () => {
      window.removeEventListener('touchstart', handleWindowClick)
      window.removeEventListener('mousedown', handleWindowClick)
    }
  }, [isOpen])

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    startXRef.current = touch.clientX
    startYRef.current = touch.clientY
    currentXRef.current = touch.clientX
    isHorizontalSwipeRef.current = null
    isDraggingRef.current = true
    setIsSwiping(true)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - startXRef.current
    const deltaY = touch.clientY - startYRef.current

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY)
      }
    }

    if (isHorizontalSwipeRef.current) {
      currentXRef.current = touch.clientX
      const baseOffset = isOpen ? -ACTION_WIDTH : 0
      let newTranslate = baseOffset + deltaX

      // Resistencia al deslizar hacia la derecha si ya está cerrado
      if (newTranslate > 0) {
        newTranslate = Math.pow(newTranslate, 0.65)
      }
      // Resistencia elástica al deslizar muy a la izquierda
      if (newTranslate < -THRESHOLD_FULL_DELETE) {
        const excess = -THRESHOLD_FULL_DELETE - newTranslate
        newTranslate = -THRESHOLD_FULL_DELETE - Math.pow(excess, 0.75)
      }

      setTranslateX(newTranslate)
    }
  }

  const finishSwipe = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsSwiping(false)

    if (translateX < -THRESHOLD_FULL_DELETE) {
      // Swipe largo completo -> activar confirmación de eliminación directamente
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(30)
        }
      } catch (_) {
        // Silencioso
      }
      setTranslateX(0)
      setIsOpen(false)
      onDelete(proyecto)
    } else if (translateX < -THRESHOLD_SNAP) {
      // Snap abierto revelando botón de eliminar
      setTranslateX(-ACTION_WIDTH)
      setIsOpen(true)
      try {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(15)
        }
      } catch (_) {
        // Silencioso
      }
    } else {
      // Cerrar y volver a posición original
      setTranslateX(0)
      setIsOpen(false)
    }
  }, [translateX, onDelete, proyecto])

  const handleTouchEnd = () => {
    finishSwipe()
  }

  const handleTouchCancel = () => {
    finishSwipe()
  }

  // Mouse Dragging para pruebas o pantallas híbridas táctiles
  const handleMouseDown = (e: React.MouseEvent) => {
    // Solo clic izquierdo
    if (e.button !== 0) return
    startXRef.current = e.clientX
    startYRef.current = e.clientY
    currentXRef.current = e.clientX
    isHorizontalSwipeRef.current = null
    isDraggingRef.current = true
    setIsSwiping(true)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const deltaX = e.clientX - startXRef.current
    const deltaY = e.clientY - startYRef.current

    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY)
      }
    }

    if (isHorizontalSwipeRef.current) {
      currentXRef.current = e.clientX
      const baseOffset = isOpen ? -ACTION_WIDTH : 0
      let newTranslate = baseOffset + deltaX

      if (newTranslate > 0) newTranslate = Math.pow(newTranslate, 0.65)
      if (newTranslate < -THRESHOLD_FULL_DELETE) {
        const excess = -THRESHOLD_FULL_DELETE - newTranslate
        newTranslate = -THRESHOLD_FULL_DELETE - Math.pow(excess, 0.75)
      }
      setTranslateX(newTranslate)
    }
  }

  const handleMouseUp = () => {
    if (isDraggingRef.current) finishSwipe()
  }

  const handleMouseLeave = () => {
    if (isDraggingRef.current) finishSwipe()
  }

  const handleCardClick = (e: React.MouseEvent) => {
    // Si estaba abierto y se hace click en el cuerpo de la tarjeta, sólo cerrarla
    if (isOpen) {
      e.stopPropagation()
      setTranslateX(0)
      setIsOpen(false)
      return
    }

    // Si hubo un arrastre horizontal notable, no abrir
    if (Math.abs(translateX) > 6) {
      e.stopPropagation()
      return
    }

    onSelect(proyecto)
  }

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setTranslateX(0)
    setIsOpen(false)
    onDelete(proyecto)
  }

  const deleteOpacity = Math.min(1, Math.max(0, -translateX / 40))
  const deleteScale = Math.min(1.15, Math.max(0.8, -translateX / ACTION_WIDTH))

  return (
    <div
      ref={cardRef}
      style={{
        position: 'relative',
        borderRadius: '12px',
        overflow: 'hidden',
        userSelect: 'none',
        touchAction: 'pan-y'
      }}
    >
      {/* Capa de fondo con botón Eliminar (Revelada al deslizar hacia la izquierda) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          background: 'linear-gradient(135deg, #B52B30 0%, #E5484D 100%)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingRight: '18px',
          zIndex: 1
        }}
      >
        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label={`Eliminar proyecto ${proyecto.title}`}
          title="Eliminar este proyecto"
          style={{
            background: 'none',
            border: 'none',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            cursor: 'pointer',
            padding: '8px 10px',
            borderRadius: '8px',
            opacity: deleteOpacity,
            transform: `scale(${deleteScale})`,
            transition: isSwiping ? 'none' : 'transform 0.15s ease, opacity 0.15s ease'
          }}
        >
          <span style={{ fontSize: '20px', lineHeight: 1 }}>🗑️</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: "'Cinzel', serif",
              letterSpacing: '0.4px',
              textShadow: '0 1px 3px rgba(0,0,0,0.4)'
            }}
          >
            Eliminar
          </span>
        </button>
      </div>

      {/* Tarjeta Frontal Deslizable */}
      <div
        onClick={handleCardClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="anim-up"
        style={{
          position: 'relative',
          background: 'linear-gradient(90deg, #1E3D4F 0%, #173242 100%)',
          border: '1px solid rgba(201, 162, 74, 0.22)',
          borderLeft: '4px solid #C9A24A',
          borderRadius: '12px',
          padding: '14px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transform: `translateX(${translateX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.18s, border-color 0.18s',
          boxShadow: isOpen
            ? '-6px 0 16px rgba(0, 0, 0, 0.4)'
            : '0 4px 12px rgba(0, 0, 0, 0.25)',
          zIndex: 2,
          willChange: 'transform'
        }}
        onMouseEnter={(e) => {
          if (!isOpen && !isSwiping) {
            e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.55)'
            e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.35), 0 0 14px rgba(201, 162, 74, 0.15)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen && !isSwiping) {
            e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.22)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)'
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0 }}>
          {/* Cuadro de icono */}
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(201, 162, 74, 0.12)',
              border: '1px solid rgba(201, 162, 74, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              flexShrink: 0
            }}
          >
            {tipoInfo.icon}
          </div>

          {/* Textos del proyecto */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                color: '#F5F1E8',
                fontFamily: "'Cinzel', Georgia, serif",
                fontWeight: 600,
                fontSize: '15px',
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3
              }}
            >
              {proyecto.title || 'Sin Título'}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px',
                fontSize: '12px',
                color: '#8E9EA7',
                fontFamily: "'Inter', sans-serif"
              }}
            >
              <span
                style={{
                  color: '#DFBE72',
                  background: 'rgba(201, 162, 74, 0.1)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 500
                }}
              >
                {tipoInfo.label}
              </span>
              <span>·</span>
              <span>{fechaRelativa}</span>
            </div>
          </div>
        </div>

        {/* Acciones de la tarjeta: Botón Editar y Flecha */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginLeft: '12px',
            flexShrink: 0
          }}
        >
          <button
            onClick={(e) => onEdit(proyecto, e)}
            title="Editar título y categoría"
            aria-label="Editar proyecto"
            style={{
              background: 'rgba(201, 162, 74, 0.12)',
              border: '1px solid rgba(201, 162, 74, 0.3)',
              color: '#DFBE72',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(201, 162, 74, 0.25)'
              e.currentTarget.style.borderColor = '#C9A24A'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(201, 162, 74, 0.12)'
              e.currentTarget.style.borderColor = 'rgba(201, 162, 74, 0.3)'
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
            </svg>
          </button>

          <div
            style={{
              color: '#C9A24A',
              display: 'flex',
              alignItems: 'center',
              opacity: 0.85
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
