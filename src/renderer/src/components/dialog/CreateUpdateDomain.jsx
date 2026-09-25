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

const DeleteDomain = ({ handleDeleteClose, domainId }) => {
  const dialogs = useDialogs()
  return (
    <div>
      <Button
        sx={{ textWrap: 'nowrap' }}
        color="error"
        onClick={async () => {
          // preview-start
          const confirmed = await dialogs.confirm(
            'Are you sure, you want to delete this Domain account?',
            {
              okText: 'Yes',
              cancelText: 'No'
            }
          )
          if (confirmed) {
            await window.electron.ipcRenderer.invoke('delete-domain', { domainId })
            handleDeleteClose()
            await dialogs.alert('Domain successfully deleted!')
          }
        }}
      >
        Delete Domain
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

export default function CreateUpdateDomain({
  open,
  setOpen,
  snackMessage,
  fetchDomainData,
  selectedDomain,
  setSelectedDomain
}) {
  const handleClickOpen = () => {
    setOpen(true)
  }
  const handleClose = () => {
    setOpen(false)
    setSelectedDomain(null)
  }

  const handleDeleteClose = () => {
    setSelectedDomain(null)
    handleClose()
    fetchDomainData()
  }

  const validationSchema = Yup.object({
    domain: Yup.string().required('Domain is required')
  })

  const handleSubmit = async (values, { setSubmitting, setErrors }) => {
    setSubmitting(true)
    const response = await window.electron.ipcRenderer.invoke(
      selectedDomain ? 'update-domain' : 'create-domain',
      values
    )

    // eslint-disable-next-line no-prototype-builtins
    if (response.hasOwnProperty('errors')) {
      response.errors.map((error) => setErrors({ [error.path]: error.msg }))
    } else {
      fetchDomainData()
      handleClose()

      snackMessage('Domain Successfully ' + (selectedDomain ? 'Updated!' : 'Created!'))
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
          New Domain
        </Button>
      </div>
      <BootstrapDialog onClose={handleClose} aria-labelledby="customized-dialog-title" open={open}>
        <DialogTitle sx={{ m: 0, p: 2 }} id="customized-dialog-title">
          {selectedDomain ? 'Update' : 'Create'} Domain
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
          initialValues={selectedDomain ? selectedDomain : initialValues}
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
                  id="domain"
                  name="domain"
                  label="Domain *"
                  value={values.domain}
                  onBlur={handleBlur}
                  onChange={handleChange}
                  error={touched.domain && Boolean(errors.domain)}
                  helperText={touched.domain && errors.domain}
                />
              </DialogContent>
              <DialogActions>
                {selectedDomain && (
                  <DialogsProvider>
                    <DeleteDomain
                      handleDeleteClose={handleDeleteClose}
                      domainId={selectedDomain._id}
                    />
                  </DialogsProvider>
                )}
                <LoadingButton
                  fullWidth
                  sx={{ backgroundColor: 'black' }}
                  type="submit"
                  loading={isSubmitting}
                  loadingIndicator={selectedDomain ? 'Update...' : 'Submit...'}
                  variant="contained"
                  size="large"
                >
                  {selectedDomain ? 'Update' : 'Submit'}
                </LoadingButton>
              </DialogActions>
            </form>
          )}
        </Formik>
      </BootstrapDialog>
    </React.Fragment>
  )
}
