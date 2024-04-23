// Start of our code
const { loadImageFromUrl, process, getSVG, setParameter } = Potrace;

let loadedOpenCV = false;
let cropper;

// jscanify object
const scanner = new jscanify()

// global url of jscanified image
var blobURL = null;
var bitmapBlob = null;

// global blob for potrace
var potraceBlob = null;

// global blob for autotrace
var autotraceBlob = null;

// openCV URL
const openCvURL = "https://docs.opencv.org/4.7.0/opencv.js"
var openCVReady = false;

// Load OpenCV on window load
window.onload = function() {
  loadOpenCV(function () {
    openCVReady = true;
    const submitBtn = document.getElementById('fileSubmit')
    submitBtn.value = 'Convert Image';
    if (!document.getElementById('bitmapImage').src.includes('assets/image_placeholder_1.png')) {
      submitBtn.disabled = false;
    }
    // initial smoothness parameter
    setParameter({alphamax: 0})
  });
}

/**
 * Load openCV to remove parallax effects
 * @param {function} onComplete the function to run after OpenCV is loaded
 */
function loadOpenCV(onComplete) {
    if (loadedOpenCV) {
        onComplete()
    } else {
        const script = document.createElement("script")
        script.src = openCvURL

        script.onload = function () {
            setTimeout(function () {
                onComplete()
            }, 1000)
            loadedOpenCV = true
        }
        document.body.appendChild(script)
    }
}

/**
 * handle vectorization logic between autotrace/potrace
 */
async function vectorizeBlob() {
  blobURL = URL.createObjectURL(bitmapBlob);
  document.getElementById('bitmapImage').src = blobURL;
  // Wait for both vectorizeTrace and vectorizeHairline to complete
  await Promise.all([vectorizeTrace(), vectorizeHairline()]);
  displaySVG();
  
  // Enable editing
  document.getElementById('cropImage').disabled = false;
  document.getElementById('myRange').disabled = false;
}

/**
 * Vectorize the image using autotrace on the server side 
 */
function vectorizeHairline() {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    const aMax = document.getElementById('myRange').value / 500;
    // Add the image to the FormData
    formData.append('image', bitmapBlob, 'image.png');

    // aMax in potrace is the inverse of autotrace. 0 is the max smoothness in autotrace. 
    // Start sharp at 10. Don't go below 1
    formData.append('corner-threshold', Math.max(10 - aMax, 1));

    fetch('https://at.genesiscreativecollective.org/convert/', {
      method: 'POST',
      mode: 'cors',
      body: formData,
    })
      .then(response => response.text())
      .then(svgTxt => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgTxt, 'image/svg+xml');
        const svgElement = doc.documentElement;
        svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        serialized = new XMLSerializer().serializeToString(svgElement);
        serialized = serialized.replace(/xmlns=""/g, '');
        autotraceBlob = new Blob([serialized], { type: 'image/svg+xml' });
        resolve();
      })
      .catch(error => {
        console.error('Error:', error);
        reject();
      });
  });
}

/**
 * Vectorize the image using Potrace
 */
function vectorizeTrace() {
  const aMax = document.getElementById('myRange').value / 500;
  return new Promise((resolve, reject) => { 
    setParameter({alphamax: aMax});
    loadImageFromUrl(blobURL);
    process( () => {
      const svg = getSVG(1);
      potraceBlob = new Blob([svg], { type: 'image/svg+xml' });
      resolve();
    });
  });
}

/**
 * Display the SVG from autotrace/potrace on the page
 */
function displaySVG() {
  // if hairline is enabled, vectorize using autotrace. Else potrace. Defaults to autotrace.
  const isHairline = hairlineToggle.checked;
  const vectorBlob = isHairline ? autotraceBlob : potraceBlob;
  const url = URL.createObjectURL(vectorBlob);

  document.getElementById('outputImage').src = url;
}

/**
 * Handle convert image button click. Fixes parallax effects and vectorizes input image
 * @param {*} event 
 */
function handleFileUpload(event) {
  // prevent default form submission
  event.preventDefault();
  // get uploaded file
  const file = document.getElementById('myFile').files[0];
  if(file) {

    // Create a URL for the image in the file and load into image element
    const imageUrl = URL.createObjectURL(file);
    const newImg = document.createElement("img");
    newImg.src = imageUrl;
    // once loaded, jscanfiy and load into Potrace
    newImg.onload = function() {
        const scanner = new jscanify();
        // canvas to blob allows for autotrace/Potrace to process the image
        const resultCanvas = scanner.extractPaper(newImg, 1159.09090909, 1500);
        resultCanvas.toBlob(function(blob) {
          // vectorize the jscanified image  
          bitmapBlob = blob;
          vectorizeBlob();
        });
    }

    // clear the file upload
    document.getElementById('myFile').value = '';
    // allow download
    document.getElementById('downloadButton').disabled = false;
  } 
  // If no file is uploaded and convert is clicked
  else {
    createToastNotification("Please upload a file.");
  }
}

/**
 * Button click handler to begin cropping workflow. Creates cropper instance around image
 * @param {*} event 
 */
function handleCropImage(event) {
  event.preventDefault();
  // disable all buttons except crop button
  document.getElementById('fileSubmit').disabled = true;
  document.getElementById('downloadButton').disabled = true;
  document.getElementById('myRange').disabled = true;
  document.getElementById('myFile').disabled = true;
  hairlineToggle.disabled = true;

  // check if a cropper instance already exists, ff it exists, destroy the previous instance
  if (this.cropper) cropper.destroy();
  // initialize a new cropper instance on the output image
  this.cropper = new Cropper(document.getElementById('bitmapImage'), {
      aspectRatio: 8.5/11, //NaN for free-form cropping
      viewMode: 1,
      autoCropArea: 1, // automatically crop the area to 100% of the image size
      responsive: true,
  });
  const cropImageButton = document.getElementById('cropImage');
  cropImageButton.removeEventListener('click', handleCropImage);
  cropImageButton.value = "Finish";
  cropImageButton.onclick = cropImage;

}

/**
 * Create a toast notification to handle lack of file upload
 */
function createToastNotification() {
  let toast = document.createElement("div");
  toast.textContent = "Please upload a file.";
  toast.className = "toast"; // Assign a class to the toast
  document.body.appendChild(toast);
  // Animate the toast to slide up
  setTimeout(function() {
    toast.style.bottom = "20px";
  }, 0);
  // Remove the toast after 3 seconds
  setTimeout(function() {
    document.body.removeChild(toast);
  }, 3000);
}

/**
 * Handle download button click. Downloads the SVG of the image
 * @param {*} event 
 */
function downloadSVG(event) {
  event.preventDefault(); 
  const outputImage = document.getElementById('outputImage');
  const downloadLink = document.createElement('a');
  downloadLink.href = outputImage.src;
  downloadLink.download = 'your_image.svg';

  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}


let croppedImageDataURL = null;
/**
 * Finalizes cropping and updates the displayed image
 * @param {*} event 
 */
function cropImage(event) {
    event.preventDefault();
    if (!this.cropper) {
        return;
    }
    const croppedCanvas = this.cropper.getCroppedCanvas(); // Get canvas of cropped image
    croppedCanvas.toBlob(function(blob) {
      bitmapBlob = blob;
      vectorizeBlob();
    });
    this.cropper.destroy(); // Cleanup cropper
    this.cropper = null; // Reset cropper variable
    const cropImageButton = document.getElementById('cropImage');
    cropImageButton.removeEventListener('click', cropImage);
    cropImageButton.value = "Crop Image";
    cropImageButton.onclick = handleCropImage;

    document.getElementById('fileSubmit').disabled = false;
    document.getElementById('downloadButton').disabled = false;
    document.getElementById('myRange').disabled = false;
    document.getElementById('myFile').disabled = false;
    hairlineToggle.disabled = false;

}

/**
 * Reset everything and prepare for a new image upload
 */
function resetDash(event) {
  event.preventDefault();
  document.getElementById('bitmapImage').src = 'assets/image_placeholder_1.png';
  document.getElementById('outputImage').src = 'assets/image_placeholder_2.png';
  document.getElementById('myFile').value = null;
  fileInput.disabled = true;
  downloadButton.disabled = true;
  slider.value = 0;
  slider.disabled = true;
  hairlineToggle.checked = true;
  cropButton.disabled = true;
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  blobURL = null;
  bitmapBlob = null;
  potraceBlob = null;
  autotraceBlob = null;
}

// Add an event listener for when a file is selected
const fileUpload = document.getElementById('myFile');
// Add an event listener for when a file is selected
fileUpload.addEventListener('change', function(event) {
    // Get the selected file
    const file = event.target.files[0];
    const submitBtn = document.getElementById('fileSubmit');
    if (file) {
      // Create a URL for the file
      if (openCVReady)
        submitBtn.disabled = false;
      const imageUrl = URL.createObjectURL(file);
      document.getElementById('bitmapImage').src = imageUrl;
    }
    else
      submitBtn.disabled = true;
});

// make bitmapimage clickable to upload file.
const bitmapImage = document.getElementById('bitmapImage');
bitmapImage.addEventListener('click', function() {
  fileUpload.click();
});

// Listen for convert file button click
const fileInput = document.getElementById("fileSubmit");
fileInput.addEventListener("click", handleFileUpload);

// Listen for reset button click
const resetButton = document.getElementById("resetBtn");
resetButton.addEventListener("click", resetDash);

// slider event listener to update smoothness
const slider = document.getElementById('myRange');
slider.addEventListener('change', function() {
  const value = slider.value / 500;
  vectorizeBlob();
});

// Cropper event listener
const cropButton = document.getElementById('cropImage');
cropButton.addEventListener('click', handleCropImage);

// Download button event listener
const downloadButton = document.getElementById('downloadButton');
downloadButton.addEventListener('click', downloadSVG);

// Hairline toggle switch event listener
const hairlineToggle = document.getElementById("toggleSwitch");
hairlineToggle.addEventListener("change", () => {
  displaySVG();
});
