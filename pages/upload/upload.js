const api = require('../../utils/api')

const MAX_FILE_COUNT = 1
const MAX_FILE_SIZE = 10 * 1024 * 1024
const IMAGE_EXT_REG = /\.(jpg|jpeg|png|webp|heic)$/i

Page({
  data: {
    currentStep: 1,
    maxFileCount: MAX_FILE_COUNT,
    tempFiles: [],
    selectedType: '出院小结',
    recordTypes: ['出院小结', '病理报告', '影像报告', '基因检测', '诊断证明', '其他'],
    remark: '',
    uploading: false
  },

  // 选择图片
  chooseImage() {
    if (this.data.tempFiles.length >= MAX_FILE_COUNT) {
      wx.showToast({ title: `最多上传${MAX_FILE_COUNT}张`, icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.takePhoto()
        } else {
          this.selectFromAlbum()
        }
      }
    })
  },

  // 拍照
  takePhoto() {
    wx.chooseMedia({
      count: MAX_FILE_COUNT - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      },
      fail: () => wx.showToast({ title: '拍照失败', icon: 'none' })
    })
  },

  // 从相册选择
  selectFromAlbum() {
    wx.chooseMedia({
      count: MAX_FILE_COUNT - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      },
      fail: () => wx.showToast({ title: '选择图片失败', icon: 'none' })
    })
  },

  // 处理选择的文件
  handleFiles(files) {
    const currentFiles = this.data.tempFiles || []
    const pathSet = new Set(currentFiles.map(item => item.path))
    let hasInvalidType = false
    let hasOversize = false

    const newFiles = files.reduce((acc, file) => {
      const path = file.tempFilePath || file.path || ''
      const size = file.size || 0
      const isImage = IMAGE_EXT_REG.test(path) || file.fileType === 'image'

      if (!path || !isImage) {
        hasInvalidType = true
        return acc
      }

      if (size > MAX_FILE_SIZE) {
        hasOversize = true
        return acc
      }

      if (pathSet.has(path)) {
        return acc
      }

      pathSet.add(path)
      acc.push({
        path,
        size,
        type: 'image'
      })
      return acc
    }, [])

    const mergedFiles = [...currentFiles, ...newFiles].slice(0, MAX_FILE_COUNT)

    this.setData({
      tempFiles: mergedFiles
    })

    if (hasInvalidType) {
      wx.showToast({ title: '仅支持 JPG/PNG 图片', icon: 'none' })
      return
    }

    if (hasOversize) {
      wx.showToast({ title: '单张图片不能超过10MB', icon: 'none' })
      return
    }

    if (currentFiles.length + newFiles.length > MAX_FILE_COUNT) {
      wx.showToast({ title: `最多上传${MAX_FILE_COUNT}张`, icon: 'none' })
    }
  },

  // 预览图片
  previewImage(e) {
    const { index } = e.currentTarget.dataset
    const urls = this.data.tempFiles.map(file => file.path)
    
    wx.previewImage({
      current: urls[index],
      urls
    })
  },

  // 删除图片
  deleteImage(e) {
    const { index } = e.currentTarget.dataset
    const files = [...this.data.tempFiles]
    files.splice(index, 1)
    
    this.setData({
      tempFiles: files
    })
  },

  // 选择病历类型
  selectType(e) {
    this.setData({
      selectedType: e.currentTarget.dataset.type
    })
  },

  // 输入备注
  onRemarkInput(e) {
    const value = (e.detail.value || '').trim().slice(0, 500)
    this.setData({
      remark: value
    })
  },

  // 上传文件
  async uploadFiles() {
    if (this.data.uploading) {
      return
    }

    if (this.data.tempFiles.length === 0) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    this.setData({ uploading: true })

    wx.showLoading({ title: '上传中...', mask: true })
    try {
      const targetFile = this.data.tempFiles[0]
      const result = await api.uploadMedicalRecord({
        filePath: targetFile.path,
        type: this.data.selectedType,
        remark: this.data.remark
      })
      const fileId = result && result.data && result.data.fileId
      if (!fileId) {
        throw new Error('上传成功但缺少 fileId')
      }

      wx.showToast({
        title: '上传成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateTo({
          url: `/pages/upload/status/status?fileId=${encodeURIComponent(fileId)}`
        })
      }, 300)
    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: '上传失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ uploading: false })
      wx.hideLoading()
    }
  }
})
