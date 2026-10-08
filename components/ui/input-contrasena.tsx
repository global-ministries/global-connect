"use client"

import React, { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { InputSistema } from "@/components/ui/sistema-diseno"

type InputContrasenaProps = Omit<React.ComponentProps<typeof InputSistema>, "type" | "accesorio">

/** Password field with a show/hide toggle, built on InputSistema. */
export const InputContrasena = React.forwardRef<HTMLInputElement, InputContrasenaProps>(
  (props, ref) => {
    const [visible, setVisible] = useState(false)
    return (
      <InputSistema
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        accesorio={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            aria-pressed={visible}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
      />
    )
  }
)
InputContrasena.displayName = "InputContrasena"
