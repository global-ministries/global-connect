"use client"

import { useState } from "react"

export function usarFormularioAutenticacion() {
  const [mostrarContraseña, setMostrarContraseña] = useState(false)
  const [email, setEmail] = useState("")
  const [contraseña, setContraseña] = useState("")
  const [confirmarContraseña, setConfirmarContraseña] = useState("")

  const alternarMostrarContraseña = () => {
    setMostrarContraseña(!mostrarContraseña)
  }

  const manejarCambioEmail = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
  }

  const manejarCambioContraseña = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContraseña(e.target.value)
  }

  const manejarCambioConfirmarContraseña = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmarContraseña(e.target.value)
  }

  const limpiarFormulario = () => {
    setEmail("")
    setContraseña("")
    setConfirmarContraseña("")
    setMostrarContraseña(false)
  }

  return {
    // Estados
    mostrarContraseña,
    email,
    contraseña,
    confirmarContraseña,
    // Acciones
    alternarMostrarContraseña,
    manejarCambioEmail,
    manejarCambioContraseña, 
    manejarCambioConfirmarContraseña,
    limpiarFormulario,
    // Setters directos si se necesitan
    setEmail,
    setContraseña,
    setConfirmarContraseña
  }
}
