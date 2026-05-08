$(() => {
  $('#impBtn').click(clickImportButton);
});

function clickImportButton() {
  // hide message
  $('#submitMessage').empty();

  importRows();
}

function importRows() {
  let isError = false;
  const rowData = {};
  // Loop through the input values
  $.each($('#editTable').find('input').not(':button, :submit, :reset, :hidden'), function () {
    const value = this.value;
    if (this.name.lastIndexOf('f_', 0) === 0) {
      // Error if is is a key but absent
      if (value === '' && $(this).parent().prev().hasClass('key')) {
        const msg = `${$(this).parent().prev()[0].innerHTML} is required.`;
        $('#submitMessage').append(`<div class='error'>${msg}</div>`);
        isError = true;
      }
    }
    if (!isError) {
      rowData[this.name.substring(2)] = value; // Assign input values to array
    }
  });

  if (!isError) {
    const jsonData = { mode: 'import', key: rowData };
    send('importGroupList', jsonData, onloadImportRows, errorImportRows);
  }
}
// import success(callback)
function onloadImportRows(xhr) {
  try {
    const dataList = JSON.parse(xhr.responseText);
    if (dataList.error != null) {
      showErrorMessageList(dataList.error);
    } else {
      // show message
      if (dataList.addCount !== 0) {
        $('#submitMessage').append(`<div>${getMessage(MESSAGE_ADD)}</div>`);
      } else {
        $('#submitMessage').append(`<div class='error'>${getErrorMessage(ERROR_ROW_EXISTS)}</div>`);
      }
    }
  } catch (e) {
    $('#submitMessage').append(`<div class='error'>${e}:${xhr.responseText}</div>`);
  }
}
// import error(callback)）
function errorImportRows(status) {
  showErrorMessage(status);
}
