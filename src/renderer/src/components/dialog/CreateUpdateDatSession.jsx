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
import * as Yup from 'yup'
import { Formik } from 'formik'
import LoadingButton from '@mui/lab/LoadingButton'
import TextField from '@mui/material/TextField'
import { DialogsProvider, useDialogs } from '@toolpad/core/useDialogs'
import { Box } from '@mui/material'

const DeleteDatSession = ({ handleDeleteClose, datSessionId }) => {
  const dialogs = useDialogs()
  return (
    <div>
      <Button
        sx={{ textWrap: 'nowrap' }}
        color="error"
        onClick={async () => {
          // preview-start
          const confirmed = await dialogs.confirm(
            'Are you sure, you want to delete this Dat Session account?',
            {
              okText: 'Yes',
              cancelText: 'No'
            }
          )
          if (confirmed) {
            await window.electron.ipcRenderer.invoke('delete-datSession', { datSessionId })
            handleDeleteClose()
            await dialogs.alert('Dat Session successfully deleted!')
          }
        }}
      >
        Delete DatSession
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

export default function CreateUpdateDatSession({
  open,
  setOpen,
  snackMessage,
  fetchDatSessionData,
  selectedDatSession,
  setSelectedDatSession
}) {
  const handleClickOpen = () => {
    setOpen(true)
  }
  const handleClose = () => {
    setOpen(false)
    setSelectedDatSession(null)
  }

  const handleDeleteClose = () => {
    setSelectedDatSession(null)
    handleClose()
    fetchDatSessionData()
  }

  const validationSchema = Yup.object({
    name: Yup.string().required('Name is required'),
    proxy: Yup.string().required('Proxy is required')
  })

  const handleSubmit = async (values, { setSubmitting, setErrors }) => {
    setSubmitting(true)
    const response = await window.electron.ipcRenderer.invoke(
      selectedDatSession ? 'update-datSession' : 'create-datSession',
      values
    )

    // eslint-disable-next-line no-prototype-builtins
    if (response.hasOwnProperty('errors')) {
      response.errors.map((error) => setErrors({ [error.path]: error.msg }))
    } else {
      fetchDatSessionData()
      handleClose()

      snackMessage('DatSession Successfully ' + (selectedDatSession ? 'Updated!' : 'Created!'))
    }
    setSubmitting(false)
  }

  const initialValues = {
    name: '',
    proxy: ''
  }

  return (
    <React.Fragment>
      <div className="w-full flex mb-2">
        <Button variant="outlined" onClick={handleClickOpen} sx={{ marginLeft: 'auto' }}>
          New Dat Session
        </Button>
      </div>
      <BootstrapDialog onClose={handleClose} aria-labelledby="customized-dialog-title" open={open}>
        <Box sx={{ width: '450px' }}>
          <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
            {selectedDatSession ? 'Update' : 'Create'} Dat Session
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
            initialValues={selectedDatSession ? selectedDatSession : initialValues}
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
            }) => (
              <form onSubmit={handleSubmit}>
                <DialogContent dividers>
                  <TextField
                    fullWidth
                    id="name"
                    name="name"
                    label="Name *"
                    value={values.name}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    disabled={selectedDatSession}
                    error={touched.name && Boolean(errors.name)}
                    helperText={touched.name && errors.name}
                    sx={{ mb: 2 }}
                  />
                  <TextField
                    fullWidth
                    id="proxy"
                    name="proxy"
                    label="Proxy *"
                    value={values.proxy}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    error={touched.proxy && Boolean(errors.proxy)}
                    helperText={touched.proxy && errors.proxy}
                    sx={{ mb: 2 }}
                  />
                </DialogContent>
                <DialogActions>
                  {selectedDatSession && (
                    <DialogsProvider>
                      <DeleteDatSession
                        handleDeleteClose={handleDeleteClose}
                        datSessionId={selectedDatSession._id}
                      />
                    </DialogsProvider>
                  )}
                  <LoadingButton
                    fullWidth
                    sx={{ backgroundColor: 'black' }}
                    type="submit"
                    loading={isSubmitting}
                    loadingIndicator={selectedDatSession ? 'Update...' : 'Submit...'}
                    variant="contained"
                    size="large"
                  >
                    {selectedDatSession ? 'Update' : 'Submit'}
                  </LoadingButton>
                </DialogActions>
              </form>
            )}
          </Formik>
        </Box>
      </BootstrapDialog>
    </React.Fragment>
  )
}
