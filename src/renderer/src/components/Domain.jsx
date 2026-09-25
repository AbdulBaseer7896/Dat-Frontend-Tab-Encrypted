import * as React from 'react'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TablePagination from '@mui/material/TablePagination'
import TableRow from '@mui/material/TableRow'
import Skeleton from '@mui/material/Skeleton'
import { format } from 'date-fns'
import CreateUpdateDomain from './dialog/CreateUpdateDomain'

const columns = [
  { id: 'domain', label: 'Domain Name', minWidth: 200 },
  {
    id: 'createdAt',
    label: 'Created At',
    minWidth: 200,
    format: (value) => format(new Date(value), 'MMMM d, yyyy h:mm:ss a')
  }
]

// eslint-disable-next-line react/prop-types
export default function Domain({ snackMessage }) {
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [domains, setDomains] = React.useState([])
  const [selectedDomain, setSelectedDomain] = React.useState()
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(10)

  const handleChangePage = (event, newPage) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value)
    setPage(0)
  }

  // Function to fetch domain data
  const fetchDomainData = async () => {
    try {
      setLoading(true)
      if (typeof window !== 'undefined') {
        const domainData = await window.electron.ipcRenderer.invoke('getAllDomains')
        domainData && setDomains(domainData)
      }
    } catch (error) {
      console.error('Error fetching Dat Session data:', error)
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchDomainData()

    return () => {
      // Clean up logic here if you set up any listeners
    }
  }, [])

  return (
    <>
      <CreateUpdateDomain
        open={open}
        setOpen={setOpen}
        snackMessage={snackMessage}
        selectedDomain={selectedDomain}
        fetchDomainData={fetchDomainData}
        setSelectedDomain={setSelectedDomain}
      />
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align}
                    style={{ minWidth: column.minWidth }}
                  >
                    {column.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell><Skeleton animation="wave" height={24} width="70%" /></TableCell>
                    <TableCell><Skeleton animation="wave" height={24} width="60%" /></TableCell>
                  </TableRow>
                ))
              ) : domains.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    No domains found
                  </TableCell>
                </TableRow>
              ) : (
                domains.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((row) => {
                  return (
                    <TableRow
                      hover
                      role="checkbox"
                      tabIndex={-1}
                      key={row._id}
                      onClick={() => {
                        setSelectedDomain(row)
                        setOpen(true)
                      }}
                    >
                      {columns.map((column) => {
                        const value = row[column.id]
                        return (
                          <TableCell key={column.id} align={column.align}>
                            {column.format ? column.format(value) : value}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[10, 25, 100]}
          component="div"
          count={domains.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      </Paper>
    </>
  )
}
