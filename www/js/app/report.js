// var serverURL = 'http://bayarea.staging.api.smellpittsburgh.org/api/v1/smell_reports';
var serverURL = 'http://api.smellpittsburgh.org/api/v1/smell_reports?area=BA';
var geocoder;
var formValidateTimer;


// generate a hash for the user
function generateUserHash() {
  var userHash;
  var bayAreaPrefix = "BA"
  var random = Math.floor(Math.random()*9007199254740991);
  var date = new Date();
  var epoch = ((date.getTime()-date.getMilliseconds())/1000);
  var input = random + " " + epoch;
  userHash = bayAreaPrefix + MD5(input);
  return userHash;
}

function geocodeAddress() {
  var address = document.getElementById('address').value;
  return new Promise(function (resolve, reject){
    if($('[name=location]').prop('disabled')){
      var latlng = address.split(',').map(parseFloat);
      resolve([{'geometry':{'location':new google.maps.LatLng(latlng[0],latlng[1])}}]);
    }else{
      geocoder.geocode({'address': address, 'bounds': 
      new google.maps.LatLngBounds(
        new google.maps.LatLng(37.851624286540286, -122.56790076098628), 
        new google.maps.LatLng(38.14975803797967,-121.97875891528315))
       }, function(results, status) {
        if (status === 'OK') {
          resolve(results);
        } else if (status === 'ZERO_RESULTS'){
          reportFailed('address to coordinate conversion failed.', 'being more exact in your location description, as if you were locating it on a map.');
          reject(status);
        }else if (status === 'OVER_QUERY_LIMIT'){
          reportFailed('address to coordinate conversion failed because of too much traffic to the site', 'trying again later (sorry about that!)');
          reject(status);
        }else if (status === 'REQUEST_DENIED'){
          reportFailed('address to coordinate conversion failed because Google denied your request for some reason (' + status + ': ' + results.error_message + ')', "taking screenshots and sending them to the email below.");
          reject(status);
        }else if (status === "INVALID_REQUEST"){
          reportFailed('address to coordinate conversion failed because of an invalid request on our side. (' + status + ': ' + results.error_message + ')', "taking screenshots and sending them to the email below.");
          reject(status);
        }else{
          reportFailed('address to coordinate conversion failed because of Google internal error (' + status + ': ' + results.error_message + ')', "trying again (that's what Google says to do).");
          reject(status);
        }
      });
    }
  });
}

function getCategoryList(){
  return $('[name=tag]:checked').map(function () {
    return encodeURIComponent((this.value == "other") ? $('[name=tag-other]').val() : this.value);
  }).get();
}

function getCaptionList(){
  return $('[name=caption]').map(function () {
    return encodeURIComponent(this.value);
  }).get();
}

function getDateTimeList(){
  var dates = $('[name=photo-date]').map(function () {
    return encodeURIComponent(this.value);
  }).get();
  var times = $('[name=photo-time]').map(function () {
    return encodeURIComponent(this.value);
  }).get();
  var dateTimeList = [];
  for(var i = 0; i < dates.length; i++){
    dateTimeList.push(dates[i]+"T"+times[i]);
  }
  return dateTimeList;
}



function serializeForm(geocodeResults, img_src_array){
  //userhash
  if(!localStorage.getItem('AWBAuser') || localStorage.getItem('AWBAuser').substring(0,2) != "BA") {
      localStorage.setItem('AWBAuser', generateUserHash());
  }
  //latlong
  var latlng = geocodeResults[0]['geometry']['location'];
  var dateTimeList = getDateTimeList();
  var captionList = getCaptionList();
  assert(img_src_array.length == captionList.length && img_src_array.length == dateTimeList.length, "public_id, datetime, and category lists should all be the same size (something really weird happened)");
  var imgData = {};
  for(var i = img_src_array.length - 1; i >= 0; i--) {
    imgData[img_src_array[i]] = {
      'caption':captionList[i],
      'when':dateTimeList[i]
    }
  }
  var additionalCommentsData = {
    "additional_comments": $('[name=additional-comments]').val() ? encodeURIComponent($('[name=additional-comments]').val()) : null,
    "tags": getCategoryList(),
    "img": imgData
  };

  var data = 
  {
    "user_hash" : localStorage.getItem('AWBAuser'),
    "latitude" : latlng.lat(),
    "longitude" : latlng.lng(),
    "smell_value" : parseInt($('[name=smell]:checked').val()),
    "smell_description" : $('[name=describe-air]').val() ? $('[name=describe-air]').val() : null,
    "feelings_symptoms" : $('[name=symptoms]').val() ? $('[name=symptoms]').val() : null,
    "additional_comments" : JSON.stringify(additionalCommentsData),
  };
  return data;
}

function postData(data){
  return new Promise(function (resolve, reject){
    $.ajax({
      method: 'POST',
      url: serverURL,
      data: data,
      success:function(msg){
        console.log("POST Result:", msg);
        if (msg.error) {
            reportFailed(msg.error, "checking that all of the required fields are entered.");
            reject(msg.error);
        }else {
            resolve(msg);
        }
      },
      error:function(err){
        reject(err);
        reportFailed(err, "checking your internet connection or see below.");     }
    });
  });
}

function processImgSubmissions(){
  return new Promise(function(resolve,reject){
    submitImgs(resolve, reject);  
  });
}

function roundLatLng(val){
  var dither = 0.002;
  return val+=(Math.random()-0.5)*dither;
}

function geolocationSuccess(position){
  $('.geocheck').remove();
  $('.geoerror').remove();
  $('[name=location]')
    .val([roundLatLng(position.coords.latitude),roundLatLng(position.coords.longitude)].join(", "))
    .before('<span class="geocheck">&#9989;</span>')
    .prop('disabled',true);
}

function geolocationError(error){
  $('.geocheck').remove();
  $('.geoerror').remove();
  // $('[name=geolocation]').prop('disabled', true);
  $('[name=geolocation]').after('<span class="geoerror" style="color:red" data-localize="report.geoerror"><span>');
  // navigator.vibrate(500);
  alert(
    'We were unable to retrieve your location data. Please enter your location in the textbox below the GPS button or check your location permissions in Settings.\nNo se puede recuperar la ubicación, ingrese la ubicación en el cuadro de texto a continuación o verifique los permisos de ubicación en su Configuración".');
}

function resetReport(){
  document.getElementById("report-form").reset();
  $('#report-submit').prop('disabled', false);
  $('#file-upload').prop('disabled', false);
  $('#submit-success').hide();
  $('.thumbnails').html('');
  $('.num-file-status').text('0');
  $('.photo-upload').hide();
  $('.geoerror').remove();
  $('.geocheck').remove();
  $('[name=geolocation]').prop('disabled', false);
  $('[name=location]').prop('disabled', false);
  $('.required-error').removeClass('required-error');
}

function submissionUploading(){
  scrollToBottom();
  disableSubmit();
  $('#uploading').show();
  $('#submit-success').hide();
  $('#upload-error').hide();
}

function submissionSuccess(){
  scrollToBottom();
  $('#uploading').hide();
  $('#submit-success').show();
  $('#upload-error').hide();
}

function reportFailed(reason, resolution){
  // navigator.vibrate(500);
  $('#submit-success').hide();
  $('#uploading').hide();
  $('#upload-error-message').text(reason);
  $('#error-resolution').text(resolution);
  $('#upload-error').show();
  enableSubmit();
  alert(
    'Report failed to upload: ' + reason + '\n\nResolve by: ' + resolution);
}

function disableSubmit(){
  $('#report-submit').prop('disabled', true);
  $('#file-upload').prop('disabled', true);
}

function enableSubmit(){
  $('#report-submit').prop('disabled', false);
  $('#file-upload').prop('disabled', false);
}

function formValidate(){
  var required = $('input.required,textarea.required');
  clearTimeout(formValidateTimer);
  for(var i = 0; i <= (required.length - 1);i++){
    if(required[i].value == '') {
        $(required[i]).parent().addClass('required-error');
        formValidateTimer = setTimeout(function(){
          $(required[i]).parent().removeClass('required-error');
        }, 2000);
        scrollToElmMiddle($(required[i]));
        return false; 
    }
  }
  return true;
}

function submitForm(){
  console.log("submit pressed");
  event.preventDefault();
  if(!formValidate()){
    return false;
  }
  submissionUploading();
  disableSubmit();
  var geocodeResults;
  geocodeAddress().then(function(results){
    geocodeResults = results;
    return processImgSubmissions();
  }).then(function(img_src_array){
    return postData(serializeForm(geocodeResults, img_src_array));
  }).then(function(results){
    submissionSuccess();
  }).catch(function(err){
    console.log(err);
    formValidate();
  });
}

function reportingInit() {
  //polyfill report form
  $('#report-form').form();
  //init geocoder
  geocoder = new google.maps.Geocoder();
  //default bounds set to Bay Area
  var defaultBounds = new google.maps.LatLngBounds(
    new google.maps.LatLng(36.906913, -123.017998),
    new google.maps.LatLng(38.8286208, -121.209588));
  var input = $('[name=location]').get(0);
  var options = {
    bounds: defaultBounds,
  };
  //sets up
  autocomplete = new google.maps.places.Autocomplete(input, options);
  $('#report-form').submit(function(event){
    event.preventDefault();
  });

  $('#report-submit').click(submitForm);

  $('#submit-another-report').click(function(){
    scrollToTop();
    resetReport();
  });

  $('[name=tag-other]').click(function(ev){
    ev.preventDefault();
    $('[name=tag][value=other]').prop("checked", true);
  });

  $('[name=tag][value=other]').click(function(ev){
    if($('[name=tag][value=other]').prop("checked")){
      $('[name=tag-other]').focus();
    }
  });

  $('#clear-form').click(function(){
    if(window.confirm("Reset the form?\nRestablecer el formulario?")){
      scrollToTop();
      resetReport();
    }
  });

  upload_spinner = new Spinner({
    position:'relative',
    left: '90%',
    radius: 8,
    color: "#666",
    opacity: .4,
    trail: 45,
  }).spin();
  document.getElementById('upload-spinner').appendChild(upload_spinner.el)
  resetReport();
  //DEBUG:
  // setTimeout(formValidate, 3000);
  // submissionSuccess();
  // submissionUploading();
  // setTimeout(function(){
  //     reportFailed("because things fail sometimes", "trying harder");
  //   },3000);
  // setTimeout(geolocationError, 3000);
}