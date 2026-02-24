// pages/upload/upload.js
const app = getApp()

Page({
  data: {
    currentStep: 1,
    tempFiles: [],
    selectedType: '出院小结',
    recordTypes: ['出院小结', '病理报告', '影像报告', '基因检测', '诊断证明', '其他'],
    remark: '',
    uploading: false,
    processingStatus: '正在识别文字...',
    parseProgress: 0,
    parseStep: 0,
    parsedData: {}
  },

  // 选择图片
  chooseImage() {
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
      count: 9 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['camera'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  // 从相册选择
  selectFromAlbum() {
    wx.chooseMedia({
      count: 9 - this.data.tempFiles.length,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.handleFiles(res.tempFiles)
      }
    })
  },

  // 处理选择的文件
  handleFiles(files) {
    const currentFiles = this.data.tempFiles
    const newFiles = files.map(file => ({
      path: file.tempFilePath,
      size: file.size,
      type: 'image'
    }))
    
    this.setData({
      tempFiles: [...currentFiles, ...newFiles].slice(0, 9)
    })
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
    const files = this.data.tempFiles
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
    this.setData({
      remark: e.detail.value
    })
  },

  // 上传文件
  async uploadFiles() {
    if (this.data.tempFiles.length === 0) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    this.setData({ uploading: true })

    try {
      // 实际项目中上传到服务器
      // for (let i = 0; i < this.data.tempFiles.length; i++) {
      //   await app.uploadFile({
      //     url: '/api/medical/upload',
      //     filePath: this.data.tempFiles[i].path,
      //     name: 'file',
      //     formData: {
      //       type: this.data.selectedType,
      //       remark: this.data.remark
      //     }
      //   })
      // }

      // 模拟上传
      await this.simulateUpload()
      
      // 进入解析步骤
      this.setData({
        currentStep: 2,
        uploading: false
      })
      
      // 开始解析
      this.startParsing()
      
    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: '上传失败，请重试',
        icon: 'none'
      })
      this.setData({ uploading: false })
    }
  },

  // 模拟上传
  simulateUpload() {
    return new Promise(resolve => setTimeout(resolve, 1500))
  },

  // 开始解析
  startParsing() {
    // 模拟解析进度
    let progress = 0
    let step = 0
    
    const interval = setInterval(() => {
      progress += Math.random() * 15
      
      if (progress > 30 && step < 1) {
        step = 1
        this.setData({ parseStep: 1 })
      }
      if (progress > 60 && step < 2) {
        step = 2
        this.setData({ 
          parseStep: 2,
          processingStatus: '正在抽取医疗实体...'
        })
      }
      if (progress > 90 && step < 3) {
        step = 3
        this.setData({ 
          parseStep: 3,
          processingStatus: '正在生成结构化数据...'
        })
      }
      
      if (progress >= 100) {
        progress = 100
        clearInterval(interval)
        
        // 解析完成
        setTimeout(() => {
          this.setData({
            currentStep: 3,
            parseProgress: 100,
            parsedData: {
              diagnosis: '非小细胞肺癌',
              stage: 'IV期',
              geneMutation: 'EGFR 19del',
              treatment: '化疗2周期'
            }
          })
        }, 500)
      }
      
      this.setData({ parseProgress: Math.floor(progress) })
    }, 300)
  },

  // 手动修正结果
  editResult() {
    wx.showToast({
      title: '进入编辑模式',
      icon: 'none'
    })
  },

  // 开始匹配试验
  startMatching() {
    wx.switchTab({
      url: '/pages/matches/matches'
    })
  }
})