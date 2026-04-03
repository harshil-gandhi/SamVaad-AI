import React, { useState, useEffect, useRef } from 'react'
import Loading from './Loading'
import toast from 'react-hot-toast'
import { useAppContext } from '../context/AppContext'

const Community = () => {
const { axios, token } = useAppContext()

const [images, setImages] = useState([])
const [loading, setLoading] = useState(true)
const [contextMenu, setContextMenu] = useState(null)
const [selectedImageId, setSelectedImageId] = useState(null)
const longPressTimerRef = useRef(null)

const handleDeleteImage = async (event, messageId) => {
  event.preventDefault()
  event.stopPropagation()

  const shouldDelete = window.confirm("Delete this community image for everyone?")
  if (!shouldDelete) return

  try {
    const { data } = await axios.delete(`/api/v1/users/published-images/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (data?.success) {
      setImages((prevImages) => prevImages.filter((image) => image?.messageId !== messageId))
      toast.success(data?.message || "Image deleted successfully")
      return
    }

    toast.error(data?.message || "Failed to delete image")
  } catch (error) {
    toast.error(error.response?.data?.message || "An error occurred while deleting image")
  }
}

const fetchImage = async () => {

  try {
   const { data } = await axios.get("/api/v1/users/published-images", {
    headers: { Authorization: `Bearer ${token}` },
   });
    if(data.success){
      setImages(data?.data || []);
    }
    else{
      toast.error(data.message || "Failed to fetch published images");
    }
  } catch (error) {
    toast.error(error.response?.data?.message || "An error occurred while fetching published images");
  }
  finally{
    setLoading(false)
  }
}

const openContextMenuAtImage = (messageId, image) => {
  const imgElement = document.querySelector(`[data-image-id="${messageId}"]`)

  if (!imgElement) return

  const rect = imgElement.getBoundingClientRect()

  setSelectedImageId(messageId)
  setContextMenu({
    x: rect.left,
    y: rect.bottom + 10,
    image,
  })
}

const handleImageLongPress = (e, messageId, image) => {
  e.preventDefault()
  openContextMenuAtImage(messageId, image)
}

const handleImageTouchStart = (messageId, image) => {
  // Clear any existing timer
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current)
  }
  
  // Set a timer for 2 seconds long press
  longPressTimerRef.current = setTimeout(() => {
    openContextMenuAtImage(messageId, image)
  }, 2000)
}

const clearLongPressTimer = () => {
  if (longPressTimerRef.current) {
    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }
}

const handleImageTouchEnd = () => {
  // Clear timer if touch ends before 2 seconds
  clearLongPressTimer()
}

const handleImageTouchCancel = () => {
  clearLongPressTimer()
}

const handleImageTouchMove = () => {
  clearLongPressTimer()
}

const handleDeleteFromContext = async (messageId) => {
  const shouldDelete = window.confirm("Delete this community image for everyone?")
  if (!shouldDelete) return

  try {
    const { data } = await axios.delete(`/api/v1/users/published-images/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (data?.success) {
      setImages((prevImages) => prevImages.filter((image) => image?.messageId !== messageId))
      toast.success(data?.message || "Image deleted successfully")
      setContextMenu(null)
      setSelectedImageId(null)
      return
    }

    toast.error(data?.message || "Failed to delete image")
  } catch (error) {
    toast.error(error.response?.data?.message || "An error occurred while deleting image")
  }
}

const closeContextMenu = () => {
  setContextMenu(null)
  setSelectedImageId(null)
}

useEffect(() => {
  // Close context menu when clicking outside
  const handleClickOutside = () => closeContextMenu()
  document.addEventListener('click', handleClickOutside)
  
  return () => {
    document.removeEventListener('click', handleClickOutside)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
  }
}, [])

useEffect(() => {
  fetchImage()
}, [])

if(loading) 
  return <Loading/>

  return (
    <div className='p-6 pt-12 xl:px-12 2xl:px-20 w-full mx-auto h-full overflow-y-scroll'>
      <h2 className='text-xl font-semibold mb-6 text-gray-600 dark:text-purple-100'>Community Images</h2>
      
      {images.length > 0 ?(
        <>
          <div className="flex flex-wrap max-sm:justify-center gap-4">
            {images.map((item ,index) => (
              <div
                key={item?.messageId || index}
                data-image-id={item?.messageId}
                onTouchStart={() => handleImageTouchStart(item?.messageId, item)}
                onTouchEnd={handleImageTouchEnd}
                onTouchCancel={handleImageTouchCancel}
                onTouchMove={handleImageTouchMove}
                onContextMenu={(e) => handleImageLongPress(e, item?.messageId, item)}
                className='relative group block rounded-lg overflow-hidden border border-gray-300 dark:border-purple-700 shadow-sm hover:shadow-md transition-shadow duration-300 cursor-pointer'
              >
                <a href={item.imageUrl} target='_blank' className='block'>
                  <img
                    src={item.imageUrl}
                    alt={item.title}
                    className='w-full h-40 md:h-50 2xl:h-62 object-cover rounded-lg shadow-md group-hover:scale-105 transition-transform duration-300 ease-in-out'
                  />
                </a>
                <p className='absolute bottom-0 right-0 bg-black/50 bg-opacity-50 text-white text-center py-1 text-sm backdrop-blur px-4 rounded-tl-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300'>Created by {item.username || "Unknown"}</p>
                {item?.canDelete && (
                  <button
                    type='button'
                    onClick={(event) => handleDeleteImage(event, item?.messageId)}
                    className='absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Mobile Long-Press Context Menu */}
          {contextMenu && (
            <div
              className='fixed inset-0 z-40'
              onClick={closeContextMenu}
            />
          )}
          {contextMenu && (
            <div
              className='fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 min-w-max'
              style={{
                left: `${Math.min(contextMenu.x, window.innerWidth - 200)}px`,
                top: `${Math.min(contextMenu.y, window.innerHeight - 150)}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Created By Option */}
              <div className='px-4 py-3 border-b border-gray-200 dark:border-gray-700'>
                <p className='text-sm text-gray-600 dark:text-gray-300'>
                  Created by <span className='font-semibold text-gray-900 dark:text-white'>{contextMenu.image?.username || "Unknown"}</span>
                </p>
              </div>

              {/* Delete Option - Only if user owns the image */}
              {contextMenu.image?.canDelete && (
                <button
                  onClick={() => {
                    closeContextMenu()
                    handleDeleteFromContext(selectedImageId)
                  }}
                  className='w-full text-left px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium text-sm'
                >
                  Delete Image
                </button>
              )}
            </div>
          )}
        </>
      ):(
        <p className='text-gray-500 text-center dark:text-purple-200 mt-10'>No images published yet.</p>
      )}
    </div>
  )
}

export default Community
