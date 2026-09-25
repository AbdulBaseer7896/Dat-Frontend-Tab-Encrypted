/* eslint-disable react/prop-types */
import * as React from 'react'
import Button from '@mui/material/Button'
import { styled } from '@mui/material/styles'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Typography from '@mui/material/Typography'
import * as Yup from 'yup'
import { Formik } from 'formik'
import LoadingButton from '@mui/lab/LoadingButton'
import OutlinedInput from '@mui/material/OutlinedInput'
import InputLabel from '@mui/material/InputLabel'
import InputAdornment from '@mui/material/InputAdornment'
import FormControl from '@mui/material/FormControl'
import TextField from '@mui/material/TextField'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import { DialogsProvider, useDialogs } from '@toolpad/core/useDialogs'
import { ListItemText, Chip, Tooltip, Box } from '@mui/material'
import { blue } from '@mui/material/colors'

const DeleteUser = ({ handleDeleteClose, userId }) => {
  const dialogs = useDialogs()
  return (
    <div>
      <Button
        color="error"
        onClick={async () => {
          // preview-start
          const confirmed = await dialogs.confirm(
            'Are you sure, you want to delete this user account?',
            {
              okText: 'Yes',
              cancelText: 'No'
            }
          )
          if (confirmed) {
            await window.electron.ipcRenderer.invoke('delete-user', { userId })
            handleDeleteClose()
            await dialogs.alert('User successfully deleted!')
          }
        }}
      >
        Delete User
      </Button>
    </div>
  )
}

const BootstrapDialog = styled(Dialog)(({ theme }) => ({
  '& .MuiDialogContent-root': {
    padding: theme.spacing(2)
  },
  '& .MuiDialogActions-root': {
    padding: theme.spacing(1)
  }
}))

export default function CreateUpdateUser({
  open,
  setOpen,
  domains,
  datSessions,
  fetchUserData,
  snackMessage,
  selectedUser,
  setSelectedUser
}) {
  const [showPassword, setShowPassword] = React.useState(false)

  const handleClickOpen = () => {
    setOpen(true)
  }
  const handleClose = () => {
    setOpen(false)
    setSelectedUser(null)
  }

  const handleClickShowPassword = () => setShowPassword((show) => !show)
  const handleMouseDownPassword = (event) => {
    event.preventDefault()
  }

  const handleMouseUpPassword = (event) => {
    event.preventDefault()
  }

  const handleDeleteClose = () => {
    setSelectedUser(null)
    handleClose()
    fetchUserData()
  }

  const [resettingDevice, setResettingDevice] = React.useState(false)

  const handleResetDevice = async () => {
    if (!selectedUser) return
    const confirmed = window.confirm(
      `Reset device binding for "${selectedUser.name || selectedUser.email}"?\n\nThey will be able to register a new computer on their next login.`
    )
    if (!confirmed) return

    setResettingDevice(true)
    try {
      await window.electron.ipcRenderer.invoke('update-user', {
        _id: selectedUser._id,
        resetDevice: true
      })
      if (typeof fetchUserData === 'function') {
        fetchUserData()
      }
      setSelectedUser((prev) => (prev ? { ...prev, hardwareId: null } : null))
      if (typeof snackMessage === 'function') {
        snackMessage('Device binding successfully reset!')
      } else {
        alert('Device binding successfully reset!')
      }
    } catch (err) {
      console.error('Failed to reset device:', err)
      alert('Failed to reset device: ' + err.message)
    } finally {
      setResettingDevice(false)
    }
  }

  const createValidationSchema = Yup.object({
    name: Yup.string().required('Name is required'),
    role: Yup.string().required('Role is required'),
    email: Yup.string().email('Enter a valid email address.').required('Email address is required'),
    password: Yup.string()
      .min(6, 'Password must be at least 6 characters long')
      .required('Password is required')
  })

  const updateValidationSchema = Yup.object({
    name: Yup.string().required('Name is required'),
    role: Yup.string().required('Role is required'),
    email: Yup.string().email('Enter a valid email address.').required('Email address is required')
  })

  const handleSubmit = async (values, { setSubmitting, setErrors }) => {
    console.log(values)

    setSubmitting(true)
    const response = await window.electron.ipcRenderer.invoke(
      selectedUser ? 'update-user' : 'create-user',
      values
    )
    // eslint-disable-next-line no-prototype-builtins
    if (response.hasOwnProperty('errors')) {
      response.errors.map((error) => setErrors({ [error.path]: error.msg }))
    } else {
      fetchUserData()
      handleClose()

      snackMessage('User Successfully ' + (selectedUser ? 'Updated!' : 'Created!'))
    }
    setSubmitting(false)
  }

  const initialValues = {
    name: '',
    email: '',
    password: '',
    role: '',
    isBanned: false,
    permissions: {
      dashboard: false,
      searchTrucks: false,
      privateLoads: false,
      myLoads: false,
      privateNetwork: false,
      myTrucks: false,
      liveSupport: false,
      tools: false,
      sendFeedback: false,
      notifications: false,
      profile: false,
      searchLoadsMultitab: true,
      searchLoadsNoMultitab: 1,
      searchLoadsLaneRate: false,
      searchLoadsViewRoute: false,
      searchLoadsRateview: false,
      searchLoadsViewDirectory: false,
      domains: [],
      // domains: [...domains.map((domain) => domain._id)],
      domain: null,
      dataSessionId: null
    }
  }

  if (selectedUser && selectedUser.permissions == null)
    selectedUser.permissions = initialValues.permissions

  if (selectedUser && selectedUser.permissions && selectedUser.permissions.dataSessionId)
    selectedUser.permissions.dataSessionId = selectedUser.permissions.dataSessionId._id

  const [windowHeight, setWindowHeight] = React.useState(window.innerHeight)

  React.useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight)
    }

    // Add resize event listener
    window.addEventListener('resize', handleResize)

    // Cleanup the event listener on component unmount
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  const domainMap = domains.reduce((acc, domain) => {
    acc[domain._id] = domain.domain
    return acc
  }, {})

  return (
    <React.Fragment>
      <div className="">
        <Button variant="outlined" onClick={handleClickOpen}>
          New User
        </Button>
      </div>
      <BootstrapDialog onClose={handleClose} aria-labelledby="customized-dialog-title" open={open}>
        <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
          {selectedUser ? 'Update' : 'Create'} User
        </DialogTitle>
        <IconButton
          aria-label="close"
          onClick={handleClose}
          sx={(theme) => ({
            position: 'absolute',
            right: 8,
            top: 8,
            color: theme.palette.grey[500]
          })}
        >
          <CloseIcon />
        </IconButton>
        <Formik
          initialValues={selectedUser ? selectedUser : initialValues}
          validationSchema={selectedUser ? updateValidationSchema : createValidationSchema}
          onSubmit={handleSubmit}
        >
          {({
            values,

            errors,

            touched,

            handleChange,

            handleBlur,

            handleSubmit,

            setFieldValue,

            isSubmitting
          }) => (
            <form onSubmit={handleSubmit}>
              <DialogContent
                dividers
                sx={{
                  maxHeight: windowHeight < 810 ? '400px' : 'none',
                  overflowY: windowHeight < 810 ? 'auto' : 'visible'
                }}
              >
                <Grid container spacing={2}>
                  {selectedUser && (
                    <Grid item xs={12}>
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 16px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                          marginBottom: '4px'
                        }}
                      >
                        <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#334155' }}>
                              Device Lock:
                            </Typography>
                            {selectedUser.hardwareId ? (
                              <Tooltip
                                title={
                                  <Box sx={{ p: 0.5 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                      Complete Hardware Device Fingerprint:
                                    </Typography>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                      {selectedUser.hardwareId}
                                    </Typography>
                                  </Box>
                                }
                                arrow
                                placement="top"
                              >
                                <Chip
                                  label="Bound to 1 Computer"
                                  size="small"
                                  sx={{
                                    backgroundColor: blue[600],
                                    color: '#fff',
                                    fontWeight: 500,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                  }}
                                />
                              </Tooltip>
                            ) : (
                              <Chip
                                label="Unbound (Free to log in on any device)"
                                size="small"
                                variant="outlined"
                                sx={{ color: '#64748b', fontSize: '0.75rem' }}
                              />
                            )}
                          </Box>
                          {selectedUser.hardwareId && (
                            <Tooltip
                              title={
                                <Box sx={{ p: 0.5 }}>
                                  <Typography variant="caption" sx={{ fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                    Complete Hardware Device Fingerprint:
                                  </Typography>
                                  <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                    {selectedUser.hardwareId}
                                  </Typography>
                                </Box>
                              }
                              arrow
                              placement="bottom-start"
                            >
                              <Typography
                                variant="caption"
                                sx={{
                                  color: '#64748b',
                                  fontFamily: 'monospace',
                                  display: 'inline-block',
                                  mt: 0.5,
                                  cursor: 'pointer',
                                  '&:hover': { color: '#0f172a', textDecoration: 'underline' }
                                }}
                              >
                                Hardware ID: {selectedUser.hardwareId.substring(0, 24)}...
                              </Typography>
                            </Tooltip>
                          )}
                        </Box>
                        {selectedUser.hardwareId && (
                          <LoadingButton
                            variant="outlined"
                            size="small"
                            loading={resettingDevice}
                            onClick={handleResetDevice}
                            sx={{
                              textTransform: 'none',
                              fontWeight: 600,
                              color: '#0f172a',
                              borderColor: '#0f172a',
                              '&:hover': {
                                borderColor: '#000000',
                                backgroundColor: '#f1f5f9'
                              }
                            }}
                          >
                            Reset Device
                          </LoadingButton>
                        )}
                      </Box>
                    </Grid>
                  )}
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      id="name"
                      name="name"
                      label="Name *"
                      value={values.name}
                      onBlur={handleBlur}
                      onChange={handleChange}
                      error={touched.name && Boolean(errors.name)}
                      helperText={touched.name && errors.name}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField
                      fullWidth
                      id="email"
                      name="email"
                      label="Email Address *"
                      value={values.email}
                      onChange={handleChange}
                      onBlur={handleBlur}
                      error={touched.email && Boolean(errors.email)}
                      helperText={touched.email && errors.email}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl
                      fullWidth
                      variant="outlined"
                      error={touched.role && Boolean(errors.role)}
                    >
                      <InputLabel id="demo-simple-select-label">User Role *</InputLabel>
                      <Select
                        labelId="demo-simple-select-label"
                        id="demo-simple-select"
                        value={values.role}
                        label="User Role *"
                        onChange={(e) => setFieldValue('role', e.target.value)}
                      >
                        <MenuItem value={'admin'}>Admin</MenuItem>
                        <MenuItem value={'user'}>User</MenuItem>
                      </Select>
                      {touched.role && errors.role && (
                        <FormHelperText>{errors.role}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={6}>
                    <FormControl
                      fullWidth
                      variant="outlined"
                      error={touched.password && Boolean(errors.password)}
                    >
                      <InputLabel htmlFor="outlined-adornment-password">
                        {selectedUser ? 'Update User Password' : 'Password *'}
                      </InputLabel>
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
                  </Grid>
                  <Grid item xs={4}>
                    {selectedUser && (
                      <DialogsProvider>
                        <DeleteUser
                          handleDeleteClose={handleDeleteClose}
                          userId={selectedUser.id}
                        />
                      </DialogsProvider>
                    )}
                  </Grid>
                  <Grid item xs={4}></Grid>
                  <Grid item xs={4}>
                    {selectedUser && (
                      <FormControlLabel
                        control={
                          <Checkbox
                            onChange={handleChange}
                            name="isBanned"
                            value={values.isBanned}
                            checked={values.isBanned}
                          />
                        }
                        label="Ban User"
                      />
                    )}
                  </Grid>
                  {values.role && values.role == 'user' && (
                    <>
                      <Grid item xs={12}>
                        <Typography>DAT Account & Domains</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <FormControl
                          fullWidth
                          variant="outlined"
                          error={touched.domain && Boolean(errors.domain)}
                        >
                          <InputLabel id="demo-simple-select-label">Account Type</InputLabel>
                          <Select
                            labelId="demo-simple-select-label"
                            id="demo-simple-select"
                            value={values.permissions.domain}
                            label="Account Type"
                            onChange={(e) => setFieldValue('permissions.domain', e.target.value)}
                          >
                            <MenuItem value={'https://one.dat.com/search-loads-ow'}>
                              Dat One
                            </MenuItem>
                            <MenuItem value={'https://power.dat.com/search/loads'}>
                              Dat Power
                            </MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4}>
                        <FormControl fullWidth>
                          <InputLabel id="demo-simple-select-label">Account *</InputLabel>
                          <Select
                            labelId="demo-simple-select-label"
                            id="demo-simple-select"
                            name="permissions.dataSessionId"
                            value={values.permissions.dataSessionId}
                            label="Account *"
                            onChange={handleChange}
                            required
                          >
                            {datSessions.map((item) => (
                              <MenuItem key={item._id} value={item._id}>
                                {item.name}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={4}>
                        <FormControl fullWidth>
                          <InputLabel id="demo-multiple-checkbox-label">Allowed Domains</InputLabel>
                          <Select
                            labelId="demo-multiple-checkbox-label"
                            id="demo-multiple-checkbox"
                            multiple
                            value={values.permissions.domains}
                            onChange={(e) => {
                              setFieldValue(
                                'permissions.domains',
                                typeof e.target.value === 'string'
                                  ? e.target.value.split(',')
                                  : e.target.value
                              )
                            }}
                            input={<OutlinedInput label="Allowed Domains" />}
                            renderValue={(selected) =>
                              selected.map((id) => domainMap[id] || id).join(', ')
                            }
                          >
                            {domains.map((item) => (
                              <MenuItem key={item._id} value={item._id}>
                                <ListItemText primary={item.domain} />
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12}>
                        <Typography>DAT Page Permission</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.dashboard"
                              value={values.permissions.dashboard}
                              checked={values.permissions.dashboard}
                            />
                          }
                          label="Dashboard"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchTrucks"
                              value={values.permissions.searchTrucks}
                              checked={values.permissions.searchTrucks}
                            />
                          }
                          label="Search Trucks"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.privateLoads"
                              value={values.permissions.privateLoads}
                              checked={values.permissions.privateLoads}
                            />
                          }
                          label="Private Loads"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.myLoads"
                              value={values.permissions.myLoads}
                              checked={values.permissions.myLoads}
                            />
                          }
                          label="My Loads"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.privateNetwork"
                              value={values.permissions.privateNetwork}
                              checked={values.permissions.privateNetwork}
                            />
                          }
                          label="Private Network"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.myTrucks"
                              value={values.permissions.myTrucks}
                              checked={values.permissions.myTrucks}
                            />
                          }
                          label="My Trucks"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.liveSupport"
                              value={values.permissions.liveSupport}
                              checked={values.permissions.liveSupport}
                            />
                          }
                          label="Live Support"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.tools"
                              value={values.permissions.tools}
                              checked={values.permissions.tools}
                            />
                          }
                          label="Tools"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.sendFeedback"
                              value={values.permissions.sendFeedback}
                              checked={values.permissions.sendFeedback}
                            />
                          }
                          label="Send Feedback"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.notifications"
                              value={values.permissions.notifications}
                              checked={values.permissions.notifications}
                            />
                          }
                          label="Notifications"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Typography>DAT Search Loads Page Permission</Typography>
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchLoadsMultitab"
                              value={values.permissions.searchLoadsMultitab}
                              checked={values.permissions.searchLoadsMultitab}
                            />
                          }
                          label="Multitab"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <TextField
                          fullWidth
                          id="searchLoadsNoMultitab"
                          name="permissions.searchLoadsNoMultitab"
                          label="Number of Multitab"
                          value={values.permissions.searchLoadsNoMultitab}
                          type="number"
                          InputProps={{
                            inputProps: { min: 1, max: 10 }
                          }}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          disabled={!values.permissions.searchLoadsMultitab}
                          error={
                            touched.searchLoadsNoMultitab && Boolean(errors.searchLoadsNoMultitab)
                          }
                          helperText={touched.searchLoadsNoMultitab && errors.searchLoadsNoMultitab}
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchLoadsLaneRate"
                              value={values.permissions.searchLoadsLaneRate}
                              checked={values.permissions.searchLoadsLaneRate}
                            />
                          }
                          label="Lane Rate"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchLoadsViewRoute"
                              value={values.permissions.searchLoadsViewRoute}
                              checked={values.permissions.searchLoadsViewRoute}
                            />
                          }
                          label="View Route"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchLoadsRateview"
                              value={values.permissions.searchLoadsRateview}
                              checked={values.permissions.searchLoadsRateview}
                            />
                          }
                          label="Rate view"
                        />
                      </Grid>
                      <Grid item xs={4}>
                        <FormControlLabel
                          control={
                            <Checkbox
                              onChange={handleChange}
                              name="permissions.searchLoadsViewDirectory"
                              value={values.permissions.searchLoadsViewDirectory}
                              checked={values.permissions.searchLoadsViewDirectory}
                            />
                          }
                          label="View Directory"
                        />
                      </Grid>
                    </>
                  )}
                </Grid>
              </DialogContent>
              <DialogActions>
                <LoadingButton
                  fullWidth
                  sx={{ backgroundColor: 'black' }}
                  type="submit"
                  loading={isSubmitting}
                  loadingIndicator={selectedUser ? 'Update...' : 'Submit...'}
                  variant="contained"
                  size="large"
                >
                  {selectedUser ? 'Update' : 'Submit'}
                </LoadingButton>
              </DialogActions>
            </form>
          )}
        </Formik>
      </BootstrapDialog>
    </React.Fragment>
  )
}
