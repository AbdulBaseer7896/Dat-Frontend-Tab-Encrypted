import * as React from 'react'
import * as Yup from 'yup'
import logo from '../assets/tech-logo.png'
import { Formik } from 'formik'
import LoadingButton from '@mui/lab/LoadingButton'
import IconButton from '@mui/material/IconButton'
import OutlinedInput from '@mui/material/OutlinedInput'
import InputLabel from '@mui/material/InputLabel'
import InputAdornment from '@mui/material/InputAdornment'
import FormControl from '@mui/material/FormControl'
import TextField from '@mui/material/TextField'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import {
  Button,
  ButtonGroup,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Snackbar
} from '@mui/material'

// eslint-disable-next-line react/prop-types
export default function Login({ checkLogin }) {
  const [showPassword, setShowPassword] = React.useState(false)
  const [openSnack, setOpenSnack] = React.useState(false)
  const [snackMsg, setSnackMsg] = React.useState('')

  const snackMessage = (msg) => {
    setSnackMsg(msg)
    setOpenSnack(true)
  }

  const handleSnackClose = () => {
    setOpenSnack(false)
  }

  const handleClickShowPassword = () => setShowPassword((show) => !show)
  const handleMouseDownPassword = (event) => {
    event.preventDefault()
  }

  const handleMouseUpPassword = (event) => {
    event.preventDefault()
  }

  const validationSchema = Yup.object({
    email: Yup.string().email('Enter a valid email address.').required('Email address is required'),
    password: Yup.string()
      .min(6, 'Password must be at least 6 characters long')
      .required('Password is required')
  })

  const handleSubmit = async (values, { setSubmitting, setErrors }) => {
    setSubmitting(true)
    if (values.rememberMe) {
      localStorage.setItem('email', values.email)
      localStorage.setItem('password', values.password)
    } else {
      localStorage.removeItem('email')
      localStorage.removeItem('password')
    }
    const response = await window.electron.ipcRenderer.invoke('login', values)
    if (response.message) {
      snackMessage(response.message)
    }
    if (Object.prototype.hasOwnProperty.call(response, 'errors')) {
      response.errors.map((error) => setErrors({ [error.path]: error.msg }))
    } else {
      checkLogin()
    }
    setSubmitting(false)
  }
  return (
    <div className="flex justify-center items-center">
      <div className="bg-white shadow-2xl rounded-lg p-10 pb-4 w-[370px]">
        <div className="">
          <h2 className="text-4xl text-center text-black mb-1">Log in</h2>
          <p className="text-center text-gray-500">to continue to your DAT account.</p>
        </div>
        <hr className="mt-4 mb-6 bg-gray-500" />
        <Formik
          initialValues={{
            email: localStorage.getItem('email') ? localStorage.getItem('email') : '',
            password: localStorage.getItem('password') ? localStorage.getItem('password') : '',
            rememberMe: true,
            message: ''
          }}
          validationSchema={validationSchema}
          onSubmit={handleSubmit}
        >
          {({
            values,

            errors,

            touched,

            handleChange,

            handleBlur,

            handleSubmit,

            isSubmitting

            /* and other goodies */
          }) => (
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                id="email"
                name="email"
                label="Username/Email *"
                value={values.email}
                onChange={handleChange}
                onBlur={handleBlur}
                error={touched.email && Boolean(errors.email)}
                helperText={touched.email && errors.email}
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={values.rememberMe}
                    onChange={handleChange}
                    name="rememberMe"
                    color="primary"
                  />
                }
                label="Remember Me"
                sx={{ mt: 2 }}
              />

              <FormControl
                sx={{ width: '100%', mt: 2 }}
                variant="outlined"
                error={touched.password && Boolean(errors.password)}
              >
                <InputLabel htmlFor="outlined-adornment-password">Password *</InputLabel>
                <OutlinedInput
                  id="outlined-adornment-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={values.password}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  endAdornment={
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle password visibility"
                        onClick={handleClickShowPassword}
                        onMouseDown={handleMouseDownPassword}
                        onMouseUp={handleMouseUpPassword}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  }
                  label="Password *"
                />
                {touched.password && errors.password && (
                  <FormHelperText>{errors.password}</FormHelperText>
                )}
              </FormControl>

              {errors.message && <FormHelperText>{errors.message}</FormHelperText>}

              <div className="my-8">
                <ButtonGroup variant="outlined" aria-label="Basic button group" fullWidth>
                  <LoadingButton
                    fullWidth
                    sx={{
                      backgroundColor: 'black',
                      borderBottomLeftRadius: '15px',
                      borderTopLeftRadius: '15px',
                      color: '#fff',
                      '&:hover': {
                        backgroundColor: 'black',
                        color: '#fff'
                      },
                      '&:active': {
                        backgroundColor: 'black',
                        color: '#fff'
                      },
                      '&.Mui-disabled': {
                        backgroundColor: 'black',
                        color: '#fff'
                      }
                    }}
                    type="submit"
                    loading={isSubmitting}
                    loadingIndicator="LOG IN..."
                    variant="contained"
                    size="large"
                  >
                    LOG IN
                  </LoadingButton>
                  <Button
                    variant="outlined"
                    sx={{
                      backgroundColor: 'black',
                      borderBottomRightRadius: '15px',
                      borderTopRightRadius: '15px',
                      width: '80px',
                      color: '#fff',
                      '&:hover': {
                        backgroundColor: 'black',
                        color: '#fff'
                      },
                      '&:active': {
                        backgroundColor: 'black',
                        color: '#fff'
                      },
                      '&.Mui-disabled': {
                        backgroundColor: 'black',
                        color: '#fff'
                      }
                    }}
                    onClick={async () => await window.electron.ipcRenderer.invoke('close-main-app')}
                  >
                    Exit
                  </Button>
                </ButtonGroup>
              </div>
            </form>
          )}
        </Formik>
        <div className="flex flex-col items-center justify-center mb-2">
          <strong className="text-center text-[12px]">Powered By</strong>
          <img alt="logo" className="w-[200px]" src={logo} />
        </div>
        <small className="text-[12px]">By continuing you agree to our terms and conditions.</small>
      </div>
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        open={openSnack}
        onClose={handleSnackClose}
        message={snackMsg}
        action={
          <Button color="inherit" onClick={handleSnackClose}>
            X
          </Button>
        }
      />
    </div>
  )
}
