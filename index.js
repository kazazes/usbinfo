/*
Copyright (c) 2014-2016, Marco Piraccini <marco.piraccini@gmail.com>
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
*/

'use strict'

var fs = require('fs')
var split2 = require('split2')
var eos = require('end-of-stream')

var countTabs = function (line) {
  return line.split('').reduce((prev, car) => {
    if (car === '\t') return ++prev
    return prev
  }, 0)
}

/**
 * Get the UDB info, with cache
 */
var getUsbInfoCached = function (cb) {
  var usbInfo
  return function (cb) {
    if (usbInfo) return cb(null, usbInfo)

    var knownTypes = ['C', 'AT', 'HID', 'R', 'BIAS', 'PHY', 'HUT', 'L', 'HCC', 'VT']

    var elements = []
    var currentPath = []
    var currentLevel = 0
    var currentType = 'device'
    // When a tab is met, the number of tab is counted.
    // if numberOfTabs = currentLevel + 1 =>
    //    currentLevel++
    //    currentPath.push(key)
    // (All that works because the list is ordered)

    var usbInfoStream = fs.createReadStream(__dirname + '/ids/usb.ids')
      .pipe(split2())
      .on('data', function (line) {
        if ((line.trim().startsWith('#')) || (!line.trim())) return // Skip comments and empty lines

        var lineArr = line.split(' ')
        // Get the current type (is level === 0)
        // C -> Class (List of known device classes, subclasses and protocols)
        // AT -> List of Audio Class Terminal Types
        // HID -> List of HID Descriptor Types
        // R -> List of HID Descriptor Item Types
        // BIAS -> List of Physical Descriptor Bias Types
        // PHY -> List of Physical Descriptor Item Types
        // HUT -> List of HID Usages
        // L -> List lf languages
        // HCC -> HID Descriptor bCountryCode
        // VT -> List of Video Class Terminal Types
        if (knownTypes.indexOf(lineArr[0].trim()) !== -1) {
          currentType = lineArr.shift()
        }

        var key = lineArr.shift().trim()
        var value

        if (lineArr) {
          value = lineArr.join(' ').trim()
        }

        var numberOfTabs = countTabs(line) // calculate the "level" form the number of the used tabs

        if (numberOfTabs === 0) {
          currentPath = [key]
          currentLevel = 0
        }
        // Increment the level
        if (numberOfTabs === (currentLevel + 1)) {
          currentLevel++
          currentPath.push(key)
        } else {
          // Same level, changing path
          currentPath[currentPath.length - 1] = key
        }

        var element = {
          key: key,
          value: value,
          path: currentPath.slice(0)
        }

        if (!elements[currentType]) elements[currentType] = []
        elements[currentType].push(element)
      })

    eos(usbInfoStream, function (err) {
      if (err) return cb('stream had an error or closed early') // TODO: better mgmt
      usbInfo = elements
      cb(null, usbInfo)
    })
  }
}

var getUsbInfo = getUsbInfoCached()

function pad (input, length, padding) {
  while ((input = input.toString()).length + (padding = padding.toString()).length < length) {
    padding += padding
  }
  return padding.substr(0, length - input.length) + input
}

var getVendor = function (vendorId, cb) {
  vendorId = pad(vendorId, 4, '0')
  getUsbInfo((err, info) => {
    if (err) return cb(err)
    var found = info.device.reduce((prev, item) => {
      if ((item.path[0] === vendorId) && (item.path.length === 1)) {
        prev = item
      }
      return prev
    }, null)
    if (!found) return cb()
    return cb(null, {
      vendorId: found.path[0],
      vendor: found.value
    })
  })
}

var getProduct = function (vendorId, productId, cb) {
  productId = pad(productId, 4, '0')
  vendorId = pad(vendorId, 4, '0')

  getUsbInfo((err, info) => {
    if (err) return cb(err)

    getVendor(vendorId, (err, vendor) => {
      if (err) return cb(err)
      if (!vendor) return cb()

      var found = info.device.reduce((prev, item) => {
        if ((item.path[0] === vendorId) && (item.path[1] === productId)) {
          prev = item
        }
        return prev
      }, null)

      var ret = {
        vendorId: vendorId,
        productId: productId,
        vendor: vendor.vendor
      }

      if (found) {
        ret.product = found.value
      }
      cb(null, ret)
    })
  })
}

module.exports = {
  getProduct: getProduct,
  getVendor: getVendor
}
