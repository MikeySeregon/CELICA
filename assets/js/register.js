import { supabase } from './supabase.js'

const form = document.getElementById('register-form')
const errorText = document.getElementById('error')

form.addEventListener('submit', async (e) => {
	e.preventDefault()

	const email = document.getElementById('email').value
	const password = document.getElementById('password').value

	const { error } = await supabase.auth.signUp({
		email,
		password
	})

	if (error) {
		errorText.textContent = error.message
		return
	}

	alert('Registro exitoso. Revisa tu correo si se requiere confirmación.')
	window.location.href = 'login.html'
})
